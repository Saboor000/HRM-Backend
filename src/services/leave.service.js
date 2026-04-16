import { supabase } from "../config/supabase.js";

const error = (s, m) => Object.assign(new Error(m), { status: s });
const todayDate = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const ACTIVE_LEAVE_STATUSES = ["pending", "approved"];
const DECISION_ACTIONS = new Set(["approved", "rejected"]);

const employeeByAuth = async (authId, optional = false) => {
  if (!authId) throw error(401, "Unauthorized: missing auth user id in token");

  const { data, error: err } = await supabase
    .from("employees")
    .select("id, auth_id")
    .eq("auth_id", authId)
    .maybeSingle();

  if (err) throw error(400, err.message);
  if (!data && !optional) throw error(404, "Employee not found");
  return data;
};

const employeeOptional = (id) => employeeByAuth(id, true);
const isEmployeeUser = (user) => user.role === "user" || user.designation === "employee";

// ---------- date ----------
const toDate = (v) =>
  !v ? null : new Date(v).toISOString().slice(0, 10);

const dateRange = (startDate, endDate) => {
  const dates = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate || startDate);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const getLeaveDates = (leave) =>
  leave.leave_type === "full_day" ? dateRange(leave.start_date, leave.end_date) : [toDate(leave.start_date)];

const getRequestedLeaveDates = (payload) => {
  const baseDate = toDate(payload.leave_date || payload.start_date) || todayDate();

  if (payload.leave_type === "short_leave" || payload.leave_type === "half_day") {
    return { startDate: baseDate, endDate: baseDate };
  }

  const startDate = toDate(payload.start_date) || baseDate;

  if (payload.leave_type === "full_day") {
    return {
      startDate,
      endDate: toDate(payload.end_date) || toDate(payload.leave_date) || startDate,
    };
  }

  return { startDate, endDate: startDate };
};

const assertNoOverlappingLeaveRequest = async (employeeId, payload) => {
  const { startDate: requestStart, endDate: requestEnd } = getRequestedLeaveDates(payload);

  const overlapFilter =
    `and(leave_type.eq.full_day,start_date.lte.${requestEnd},end_date.gte.${requestStart}),` +
    `and(leave_type.neq.full_day,start_date.gte.${requestStart},start_date.lte.${requestEnd})`;

  const { data, error: err } = await supabase
    .from("leaves")
    .select("id")
    .eq("employee_id", employeeId)
    .in("status", ACTIVE_LEAVE_STATUSES)
    .or(overlapFilter)
    .limit(1);

  if (err) throw error(400, err.message);

  if (data?.length) {
    throw error(409, "Leave request already exists for the selected day");
  }
};

const getAssignmentShiftForDate = async (employeeId, date) => {
  const { data, error: err } = await supabase
    .from("employee_shift_assignments")
    .select("shift_id")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .lte("assigned_from", date)
    .or(`assigned_to.is.null,assigned_to.gte.${date}`)
    .maybeSingle();

  if (err) throw error(400, err.message);
  return data?.shift_id || null;
};

const syncLeaveAttendanceRows = async (leave) => {
  const now = nowIso();
  const records = [];

  for (const date of getLeaveDates(leave)) {
    const { data: existing, error: existingErr } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("employee_id", leave.employee_id)
      .eq("date", date)
      .maybeSingle();

    if (existingErr) throw error(400, existingErr.message);
    if (existing) continue;

    records.push({
      id: crypto.randomUUID(),
      employee_id: leave.employee_id,
      shift_id: await getAssignmentShiftForDate(leave.employee_id, date),
      date,
      check_in_time: null,
      check_out_time: null,
      status: "leave",
      leave_override: false,
      duration_hours: 0,
      overtime_hours: 0,
      notes: leave.reason || null,
      created_at: now,
      updated_at: now,
    });
  }

  if (!records.length) return;

  const { error: insertErr } = await supabase.from("attendance_records").insert(records);
  if (insertErr) throw error(400, insertErr.message);
};

// ---------- leave calc ----------
export const calculateLeave = (d) => {
  if (d.leave_type === "full_day") {
    const diff =
      (new Date(d.end_date) - new Date(d.start_date)) /
      (1000 * 60 * 60 * 24);
    return { total_days: diff + 1, total_hours: 0 };
  }

  if (d.leave_type === "half_day")
    return { total_days: 0.5, total_hours: 0 };

  const [sh, sm] = d.start_time.split(":").map(Number);
  const [eh, em] = d.end_time.split(":").map(Number);

  const hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (hours <= 0) throw error(422, "Invalid time range");

  return { total_days: 0, total_hours: hours };
};


const leaveSelect = `
  *,
  employee:employees!employee_id(
    id,
    first_name,
    last_name,
    designation,
    department
  ),
  approver:employees!approved_by(
    id,
    first_name,
    last_name,
    designation
  ),
  rejector:employees!rejected_by(
    id,
    first_name,
    last_name,
    designation
  )
`;

const updateLeaveAndFetch = async (id, updateData) => {
  const { data, error: updateErr } = await supabase
    .from("leaves")
    .update(updateData)
    .eq("id", id)
    .select(leaveSelect)
    .single();

  if (updateErr) throw error(400, updateErr.message);
  return data;
};

const assertDecisionAction = (action, actorLabel) => {
  if (!DECISION_ACTIONS.has(action)) {
    throw error(422, `Invalid ${actorLabel} action`);
  }
};

const formatLeaveResponse = (leave) => {
  if (!leave) return leave;
  const { employee_id, ...rest } = leave;
  return rest;
};

// ---------- create ----------
export const createLeaveService = async (payload, user) => {
  const employee = await employeeByAuth(user.id);
  await assertNoOverlappingLeaveRequest(employee.id, payload);
  const { startDate, endDate } = getRequestedLeaveDates(payload);
  const calc = calculateLeave({
    ...payload,
    start_date: startDate,
    end_date: endDate,
  });

  const { data, error: err } = await supabase
    .from("leaves")
    .insert({
      employee_id: employee.id,
      leave_type: payload.leave_type,
      start_date: startDate,
      end_date: endDate,
      half_day_type: payload.half_day_type || null,
      start_time: payload.start_time || null,
      end_time: payload.end_time || null,
      reason: payload.reason || "",
      status: "pending",
      manager_status: "pending",
      hr_status: "pending",
      ...calc,
    })
    .select(leaveSelect)
    .single();

  if (err) throw error(400, err.message);
  return formatLeaveResponse(data);
};

const getLeaveForDecision = async (id) => {
  const { data: leave, error: err } = await supabase
    .from("leaves")
    .select("id, employee_id, status, manager_status, hr_status")
    .eq("id", id)
    .single();

  if (err || !leave) throw error(404, "Leave request not found");
  return leave;
};

export const managerLeaveActionService = async (id, action, user, reason) => {
  const leave = await getLeaveForDecision(id);
  if (leave.status !== "pending") throw error(409, getStatusMessage(leave.status));
  if (leave.manager_status !== "pending") throw error(409, "Manager has already taken action on this request");

  const actor = await employeeOptional(user.auth_id || user.id);
  const now = nowIso();
  const isApproved = action === "approved";
  const isRejected = action === "rejected";
  assertDecisionAction(action, "manager");

  const updateData = {
    manager_status: action,
    manager_approved_at: now,
    updated_at: now,
  };

  if (isRejected) {
    updateData.status = "rejected";
    updateData.rejected_at = now;
    updateData.rejected_by = actor?.id || null;
    updateData.rejection_reason = reason || null;
  }

  const data = await updateLeaveAndFetch(id, updateData);
  return formatLeaveResponse(data);
};

export const hrLeaveActionService = async (id, action, user, reason) => {
  const leave = await getLeaveForDecision(id);
  if (leave.status !== "pending") throw error(409, getStatusMessage(leave.status));
  if (leave.manager_status !== "approved") {
    throw error(409, "HR action is allowed only after manager approval");
  }
  if (leave.hr_status !== "pending") throw error(409, "HR has already taken action on this request");

  const actor = await employeeOptional(user.auth_id || user.id);
  const now = nowIso();
  const isApproved = action === "approved";
  const isRejected = action === "rejected";
  assertDecisionAction(action, "HR");

  const updateData = {
    hr_status: action,
    hr_approved_at: now,
    updated_at: now,
    status: action,
  };

  if (isApproved) {
    updateData.approved_at = now;
    updateData.approved_by = actor?.id || null;
  }

  if (isRejected) {
    updateData.rejected_at = now;
    updateData.rejected_by = actor?.id || null;
    updateData.rejection_reason = reason || null;
  }

  const data = await updateLeaveAndFetch(id, updateData);

  if (isApproved) {
    await syncLeaveAttendanceRows(data);
  }

  return formatLeaveResponse(data);
};

// ---------- list ----------
export const getLeavesService = async ({ user, query = {}, ownOnly }) => {
  const {
    page = 1,
    limit = 10,
    status,
    manager_status,
    hr_status,
    leave_type,
    employee_id,
    start_date,
    end_date,
    sortOrder = "desc",
  } = query;

  const from = (page - 1) * limit;

  let q = supabase
    .from("leaves")
    .select(leaveSelect)
    .order("submitted_at", { ascending: sortOrder === "asc" })
    .range(from, from + limit - 1);

  if (ownOnly || isEmployeeUser(user)) {
    const emp = await employeeByAuth(user.auth_id || user.id);
    q = q.eq("employee_id", emp.id);
  }

  const exactFilters = { employee_id, status, manager_status, hr_status, leave_type };
  for (const [key, value] of Object.entries(exactFilters)) {
    if (value) q = q.eq(key, value);
  }

  if (start_date) q = q.gte("start_date", toDate(start_date));
  if (end_date) q = q.lte("end_date", toDate(end_date));

  const { data, error: err, count } = await q;
  if (err) throw error(400, err.message);

  return {
    leaves: (data || []).map(formatLeaveResponse),
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: count ? Math.ceil(count / limit) : 0,
    },
  };
};

// ---------- single ----------
export const getLeaveByIdService = async ({ id, user }) => {
  const { data, error: err } = await supabase
    .from("leaves")
    .select(leaveSelect)
    .eq("id", id)
    .single();

  if (err) throw error(400, err.message);

  if (isEmployeeUser(user)) {
    const emp = await employeeByAuth(user.auth_id || user.id);
    if (emp.id !== data.employee_id) throw error(403, "Forbidden");
  }

  return formatLeaveResponse(data);
};

// ---------- update status ----------
const getStatusMessage = (currentStatus) => {
  if (currentStatus === "approved") return "This leave request has already been approved and cannot be modified";
  if (currentStatus === "rejected") return "This leave request has already been rejected and cannot be modified";
  if (currentStatus === "cancelled") return "This leave request has already been cancelled and cannot be modified";
  return "This leave request cannot be modified in its current state";
};

const getCancelStatusError = (status) => {
  if (status === "approved") return "Approved leave requests cannot be cancelled";
  if (status === "rejected") return "Rejected leave requests cannot be cancelled";
  if (status === "cancelled") return "This leave request has already been cancelled";
  return "This leave request cannot be cancelled in its current state";
};

export const updateLeaveStatusService = async (id, status, user, reason) => {
  const { data: leave, error: err } = await supabase
    .from("leaves")
    .select("id, status")
    .eq("id", id)
    .single();

  if (err || !leave) throw error(404, "Leave request not found");
  if (leave.status !== "pending") throw error(409, getStatusMessage(leave.status));

  const emp = await employeeOptional(user.auth_id || user.id);

  const base = {
    status,
    updated_at: nowIso(),
  };

  if (status === "approved") {
    base.approved_at = nowIso();
    base.approved_by = emp?.id || null;
  }

  if (status === "rejected") {
    base.rejected_at = nowIso();
    base.rejected_by = emp?.id || null;
    base.rejection_reason = reason || null;
  }

  const data = await updateLeaveAndFetch(id, base);

  if (status === "approved") {
    await syncLeaveAttendanceRows(data);
  }

  return formatLeaveResponse(data);
};

// ---------- cancel ----------
export const cancelLeaveService = async (id, user, reason) => {
  const { data: leave, error: err } = await supabase
    .from("leaves")
    .select("id, employee_id, status")
    .eq("id", id)
    .single();

  if (err || !leave) throw error(404, "Leave request not found");
  if (leave.status !== "pending") throw error(409, getCancelStatusError(leave.status));

  if (isEmployeeUser(user)) {
    const emp = await employeeByAuth(user.auth_id || user.id);
    if (emp.id !== leave.employee_id) throw error(403, "Forbidden");
  }

  const data = await updateLeaveAndFetch(id, {
    status: "cancelled",
    rejection_reason: reason || null,
    updated_at: nowIso(),
  });

  return formatLeaveResponse(data);
};