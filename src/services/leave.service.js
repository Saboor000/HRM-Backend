import { supabase } from "../config/supabase.js";

const error = (s, m) => Object.assign(new Error(m), { status: s });

const employeeByAuth = async (authId, optional = false) => {
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

// ---------- date ----------
const toDate = (v) =>
  !v ? null : new Date(v).toISOString().slice(0, 10);

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
  approver:employees!approved_by(
    id,
    first_name,
    last_name,
    role
  ),
  rejector:employees!rejected_by(
    id,
    first_name,
    last_name,
    role
  )
`;

// ---------- create ----------
export const createLeaveService = async (payload, user) => {
  const employee = await employeeByAuth(user.id);
  const calc = calculateLeave(payload);

  const { data, error: err } = await supabase
    .from("leaves")
    .insert({
      employee_id: employee.id,
      leave_type: payload.leave_type,
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      half_day_type: payload.half_day_type || null,
      start_time: payload.start_time || null,
      end_time: payload.end_time || null,
      reason: payload.reason || "",
      status: "pending",
      ...calc,
    })
    .select("*")
    .single();

  if (err) throw error(400, err.message);
  return data;
};

// ---------- list ----------
export const getLeavesService = async ({ user, query = {}, ownOnly }) => {
  const { page = 1, limit = 10, status, leave_type, employee_id, start_date, end_date, sortOrder = "desc" } = query;

  const from = (page - 1) * limit;

  let q = supabase
    .from("leaves")
    .select(
     leaveSelect,
    )
    .order("submitted_at", { ascending: sortOrder === "asc" })
    .range(from, from + limit - 1);

  if (ownOnly || user.role === "employee") {
    const emp = await employeeByAuth(user.id);
    q = q.eq("employee_id", emp.id);
  }

  if (employee_id) q = q.eq("employee_id", employee_id);
  if (status) q = q.eq("status", status);
  if (leave_type) q = q.eq("leave_type", leave_type);
  if (start_date) q = q.gte("start_date", toDate(start_date));
  if (end_date) q = q.lte("end_date", toDate(end_date));

  const { data, error: err, count } = await q;
  if (err) throw error(400, err.message);

  return {
    leaves: data || [],
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

  if (user.role === "employee") {
    const emp = await employeeByAuth(user.id);
    if (emp.id !== data.employee_id) throw error(403, "Forbidden");
  }

  return data;
};

// ---------- update status ----------
const getStatusMessage = (currentStatus) => {
  if (currentStatus === "approved") return "This leave request has already been approved and cannot be modified";
  if (currentStatus === "rejected") return "This leave request has already been rejected and cannot be modified";
  if (currentStatus === "cancelled") return "This leave request has already been cancelled and cannot be modified";
  return "This leave request cannot be modified in its current state";
};

export const updateLeaveStatusService = async (id, status, user, reason) => {
  const { data: leave, error: err } = await supabase
    .from("leaves")
    .select("id, status")
    .eq("id", id)
    .single();

  if (err || !leave) throw error(404, "Leave request not found");
  if (leave.status !== "pending") throw error(409, getStatusMessage(leave.status));

  const emp = await employeeOptional(user.id);

  const base = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "approved") {
    base.approved_at = new Date().toISOString();
    base.approved_by = emp?.id || null;
  }

  if (status === "rejected") {
    base.rejected_at = new Date().toISOString();
    base.rejected_by = emp?.id || null;
    base.rejection_reason = reason || null;
  }

  const { data, error: uErr } = await supabase
    .from("leaves")
    .update(base)
    .eq("id", id)
    .select(leaveSelect)
    .single();

  if (uErr) throw error(400, uErr.message);
  return data;
};

// ---------- cancel ----------
export const cancelLeaveService = async (id, user, reason) => {
  const { data: leave, error: err } = await supabase
    .from("leaves")
    .select("id, employee_id, status")
    .eq("id", id)
    .single();

  if (err || !leave) throw error(404, "Leave request not found");
  if (leave.status !== "pending") {
    if (leave.status === "approved") throw error(409, "Approved leave requests cannot be cancelled");
    if (leave.status === "rejected") throw error(409, "Rejected leave requests cannot be cancelled");
    if (leave.status === "cancelled") throw error(409, "This leave request has already been cancelled");
    throw error(409, "This leave request cannot be cancelled in its current state");
  }

  if (user.role === "employee") {
    const emp = await employeeByAuth(user.id);
    if (emp.id !== leave.employee_id) throw error(403, "Forbidden");
  }

  const { data, error: uErr } = await supabase
    .from("leaves")
    .update({
      status: "cancelled",
      rejection_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (uErr) throw error(400, uErr.message);
  return data;
};