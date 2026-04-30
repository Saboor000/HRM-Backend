import { supabase } from "../../config/supabase.js";
import { employeeByAuth } from "./assignment.service.js";
import { resolveTimezone, toClockMinutesInTimezone } from "../../utils/timezone.js";

const error = (status, message) => Object.assign(new Error(message), { status });
const OVERTIME_SELECT = `
  *,
  employee:employee_id(id, first_name, last_name, designation, department)
`;
const OVERTIME_APPROVAL_SELECT = `
  *,
  employee:employee_id(id, first_name, last_name)
`;
const POLICY_TIMEZONE = resolveTimezone(
  process.env.PAYROLL_POLICY_TIMEZONE,
  process.env.ATTENDANCE_TIMEZONE,
  "Asia/Karachi"
);
const toPagination = (page, limit, count) => ({
  page,
  limit,
  total: count || 0,
  pages: Math.ceil((count || 0) / limit),
});
const isStrictOvertimeEnforcement = (policy) => {
  if (!policy || typeof policy !== "object") return false;
  return String(policy.limit_enforcement_mode || "").toLowerCase() === "strict";
};
const applyExactFilters = (query, filters, keys) =>
  keys.reduce((acc, key) => (filters[key] ? acc.eq(key, filters[key]) : acc), query);
const toDateOnly = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
};
const getMonthBoundaries = (dateText) => {
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return null;

  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
};
const toClockMinutes = (time) => {
  const [h, m] = String(time || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const resolveOvertimePolicyForEmployee = async (employeeId) => {
  const { data: structure, error: structureErr } = await supabase
    .from("salary_structures")
    .select("id, overtime_policy_id")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (structureErr) throw error(400, structureErr.message);
  if (!structure?.overtime_policy_id) {
    throw error(400, "No overtime policy is linked to employee active salary structure");
  }

  const { data: policy, error: policyErr } = await supabase
    .from("overtime_policies")
    .select("*")
    .eq("id", structure.overtime_policy_id)
    .maybeSingle();

  if (policyErr) throw error(400, policyErr.message);
  if (!policy) throw error(400, "Linked overtime policy not found");

  return policy;
};
const getExistingOvertimeHours = async (employeeId, date, monthRange) => {
  const baseQuery = supabase
    .from("overtime_requests")
    .select("hours, date, status")
    .eq("employee_id", employeeId)
    .eq("status", "approved");

  const [dailyRes, monthlyRes] = await Promise.all([
    baseQuery.eq("date", date),
    supabase
      .from("overtime_requests")
      .select("hours, date, status")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .gte("date", monthRange.start)
      .lte("date", monthRange.end),
  ]);

  if (dailyRes.error) throw error(400, dailyRes.error.message);
  if (monthlyRes.error) throw error(400, monthlyRes.error.message);

  const dailyHours = (dailyRes.data || []).reduce((sum, row) => sum + Number(row.hours || 0), 0);
  const monthlyHours = (monthlyRes.data || []).reduce((sum, row) => sum + Number(row.hours || 0), 0);

  return { dailyHours, monthlyHours };
};
const getAttendanceOvertimeEligibility = async ({ employeeId, date, policy, requestedHours }) => {
  const { data: attendance, error: attendanceErr } = await supabase
    .from("attendance_records")
    .select("id, check_in_time, check_out_time, duration_hours, shift:shift_id(id, start_time, end_time, duration_hours)")
    .eq("employee_id", employeeId)
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (attendanceErr) throw error(400, attendanceErr.message);
  if (!attendance?.check_in_time || !attendance?.check_out_time) {
    return {
      hasViolation: true,
      violations: [
        {
          code: "attendance_not_completed",
          message: "Overtime requires a completed attendance record (check-in and check-out)",
        },
      ],
    };
  }

  const workedHours = Number(attendance.duration_hours || 0);
  const shiftHours = Number(attendance?.shift?.duration_hours || policy?.standard_work_hours_per_day || 8);
  const requireFullShift = policy?.require_full_shift_for_overtime !== false;

  const shiftStartMinutes = toClockMinutesInTimezone(attendance?.shift?.start_time, POLICY_TIMEZONE);
  const shiftEndRawMinutes = toClockMinutesInTimezone(attendance?.shift?.end_time, POLICY_TIMEZONE);
  const checkInRawMinutes = toClockMinutesInTimezone(attendance.check_in_time, POLICY_TIMEZONE);

  const shiftEndMinutes =
    shiftStartMinutes !== null && shiftEndRawMinutes !== null && shiftEndRawMinutes <= shiftStartMinutes
      ? shiftEndRawMinutes + 1440
      : shiftEndRawMinutes;

  const normalizeToShiftWindow = (minutes) =>
    shiftStartMinutes !== null && minutes !== null && minutes < shiftStartMinutes ? minutes + 1440 : minutes;

  const checkInMinutes = normalizeToShiftWindow(checkInRawMinutes);
  const lateMinutes =
    shiftStartMinutes !== null && checkInMinutes !== null
      ? Math.max(0, checkInMinutes - shiftStartMinutes)
      : 0;

  const attendanceEligibleHours = requireFullShift
    ? Math.max(0, workedHours - shiftHours - lateMinutes / 60)
    : Math.max(0, workedHours - shiftHours);

  if (requestedHours > round2(attendanceEligibleHours) + 0.01) {
    return {
      hasViolation: true,
      violations: [
        {
          code: "beyond_attendance_eligibility",
          message: `Requested overtime exceeds attendance-eligible overtime (${round2(attendanceEligibleHours)} hour(s))`,
          worked_hours: round2(workedHours),
          shift_hours: round2(shiftHours),
          late_minutes: Math.round(lateMinutes),
          require_full_shift_for_overtime: requireFullShift,
          requested_hours: requestedHours,
          eligible_hours: round2(attendanceEligibleHours),
          shift_end_minutes: shiftEndMinutes,
        },
      ],
    };
  }

  return {
    hasViolation: false,
    violations: [],
    context: {
      worked_hours: round2(workedHours),
      shift_hours: round2(shiftHours),
      late_minutes: Math.round(lateMinutes),
      require_full_shift_for_overtime: requireFullShift,
      eligible_hours: round2(attendanceEligibleHours),
    },
  };
};
const validateOvertimePolicyLimits = ({ requestedHours, policy, existingDailyHours, existingMonthlyHours }) => {
  const violations = [];
  const minPerDay = Number(policy.min_hours_per_day || 0);
  const maxPerDay = Number(policy.max_hours_per_day || 0);
  const maxPerMonth = Number(policy.max_hours_per_month || 0);

  if (minPerDay > 0 && requestedHours < minPerDay) {
    violations.push({
      code: "below_daily_min",
      message: `Overtime request is below minimum per-day policy (${minPerDay} hour(s))`,
      min_hours_per_day: minPerDay,
      requested_hours: requestedHours,
    });
  }

  if (maxPerDay > 0 && (existingDailyHours + requestedHours) > maxPerDay) {
    violations.push({
      code: "above_daily_max",
      message: `Daily overtime limit exceeded. Policy max is ${maxPerDay} hour(s), existing is ${existingDailyHours}, requested is ${requestedHours}`,
      max_hours_per_day: maxPerDay,
      existing_daily_hours: existingDailyHours,
      requested_hours: requestedHours,
    });
  }

  if (maxPerMonth > 0 && (existingMonthlyHours + requestedHours) > maxPerMonth) {
    violations.push({
      code: "above_monthly_max",
      message: `Monthly overtime limit exceeded. Policy max is ${maxPerMonth} hour(s), existing is ${existingMonthlyHours}, requested is ${requestedHours}`,
      max_hours_per_month: maxPerMonth,
      existing_monthly_hours: existingMonthlyHours,
      requested_hours: requestedHours,
    });
  }

  return {
    violations,
    hasViolation: violations.length > 0,
    strictMode: isStrictOvertimeEnforcement(policy),
  };
};
const ensurePendingStatus = (entity, action) => {
  if (entity.status !== "pending") {
    throw error(400, `Cannot ${action} a ${entity.status} request`);
  }
};
const updateOvertimeRequestStatus = async (id, approverId, status) => {
  const { data, error: err } = await supabase
    .from("overtime_requests")
    .update({
      status,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(OVERTIME_APPROVAL_SELECT)
    .single();

  if (err) throw error(400, err.message);
  return data;
};

const updateOvertimeRequestCancellation = async (id) => {
  const { data, error: err } = await supabase
    .from("overtime_requests")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(OVERTIME_SELECT)
    .single();

  if (err) throw error(400, err.message);
  return data;
};

export const createOvertimeRequestService = async (userId, payload) => {
  try {
    const employee = await employeeByAuth(userId);
    const requestDate = toDateOnly(payload.date);
    if (!requestDate) {
      throw error(400, "Invalid date");
    }
    const monthRange = getMonthBoundaries(requestDate);
    if (!monthRange) {
      throw error(400, "Invalid date");
    }

    const startTotalMinutes = toClockMinutes(payload.start_time);
    const endTotalMinutes = toClockMinutes(payload.end_time);

    if (startTotalMinutes === null || endTotalMinutes === null) {
      throw error(400, "Invalid start_time or end_time");
    }

    if (endTotalMinutes <= startTotalMinutes) {
      throw error(400, "end_time must be greater than start_time");
    }

    const calculatedMinutes = endTotalMinutes - startTotalMinutes;
    const calculatedHours = calculatedMinutes / 60;
    const requestedHours = Number(payload.hours || 0);

    if (!Number.isFinite(requestedHours) || requestedHours <= 0) {
      throw error(400, "hours must be a positive number");
    }

    if (Math.abs(calculatedHours - requestedHours) > 0.1) {
      throw error(
        400,
        `Hours mismatch. Time difference: ${calculatedHours.toFixed(2)} hours`
      );
    }

    const policy = await resolveOvertimePolicyForEmployee(employee.id);
    const { dailyHours, monthlyHours } = await getExistingOvertimeHours(employee.id, requestDate, monthRange);
    const attendanceEligibility = await getAttendanceOvertimeEligibility({
      employeeId: employee.id,
      date: requestDate,
      policy,
      requestedHours,
    });

    const policyCheck = validateOvertimePolicyLimits({
      requestedHours,
      policy,
      existingDailyHours: dailyHours,
      existingMonthlyHours: monthlyHours,
    });

    if (policyCheck.strictMode && (policyCheck.hasViolation || attendanceEligibility.hasViolation)) {
      const firstError = policyCheck.hasViolation
        ? policyCheck.violations[0].message
        : attendanceEligibility.violations[0].message;
      throw error(400, firstError);
    }

    if (policyCheck.strictMode && policyCheck.hasViolation) {
      throw error(400, policyCheck.violations[0].message);
    }

    const { data, error: err } = await supabase
      .from("overtime_requests")
      .insert({
        employee_id: employee.id,
        date: requestDate,
        start_time: payload.start_time,
        end_time: payload.end_time,
        hours: requestedHours,
        reason: payload.reason || null,
        status: "pending",
        manager_status: "pending",
        hr_status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select(OVERTIME_SELECT)
      .single();

    if (err) throw error(400, err.message);

    return {
      ...data,
      ...(policyCheck.hasViolation || attendanceEligibility.hasViolation
        ? {
            policy_warning: {
              mode: "manual",
              message: "Request exceeds overtime policy limits but is allowed in manual mode",
              violations: [...policyCheck.violations, ...attendanceEligibility.violations],
            },
          }
        : {}),
      ...(attendanceEligibility.context ? { attendance_eligibility: attendanceEligibility.context } : {}),
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const approveOvertimeRequestService = async (id, userId) => {
  try {
    const approver = await employeeByAuth(userId);

    const overtimeReq = await getOvertimeRequestByIdService(id);

    ensurePendingStatus(overtimeReq, "approve");

    const requestDate = toDateOnly(overtimeReq.date);
    const monthRange = getMonthBoundaries(requestDate);
    if (!requestDate || !monthRange) {
      throw error(400, "Invalid overtime request date");
    }

    const policy = await resolveOvertimePolicyForEmployee(overtimeReq.employee_id);
    const { dailyHours, monthlyHours } = await getExistingOvertimeHours(overtimeReq.employee_id, requestDate, monthRange);
    const attendanceEligibility = await getAttendanceOvertimeEligibility({
      employeeId: overtimeReq.employee_id,
      date: requestDate,
      policy,
      requestedHours: Number(overtimeReq.hours || 0),
    });

    const policyCheck = validateOvertimePolicyLimits({
      requestedHours: Number(overtimeReq.hours || 0),
      policy,
      existingDailyHours: dailyHours,
      existingMonthlyHours: monthlyHours,
    });

    if (policyCheck.strictMode && (policyCheck.hasViolation || attendanceEligibility.hasViolation)) {
      const firstError = policyCheck.hasViolation
        ? policyCheck.violations[0].message
        : attendanceEligibility.violations[0].message;
      throw error(400, firstError);
    }

    // Direct approve (keeps backward compatibility) - treat as HR approval
    const approved = await updateOvertimeRequestStatus(id, approver.id, "approved");
    return {
      ...approved,
      ...(policyCheck.hasViolation || attendanceEligibility.hasViolation
        ? {
            policy_warning: {
              mode: "manual",
              message: "Approval exceeds overtime policy limits but is allowed in manual mode",
              violations: [...policyCheck.violations, ...attendanceEligibility.violations],
            },
          }
        : {}),
      ...(attendanceEligibility.context ? { attendance_eligibility: attendanceEligibility.context } : {}),
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const rejectOvertimeRequestService = async (id, userId) => {
  try {
    const approver = await employeeByAuth(userId);

    const overtimeReq = await getOvertimeRequestByIdService(id);

    ensurePendingStatus(overtimeReq, "reject");

    // Direct reject (treat as HR reject)
    return updateOvertimeRequestStatus(id, approver.id, "rejected");
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

// ---------- manager / hr decision flow ----------
const getOvertimeRequestForDecision = async (id) => {
  const { data, error: err } = await supabase
    .from("overtime_requests")
    .select("id, employee_id, status, manager_status, hr_status")
    .eq("id", id)
    .single();

  if (err || !data) throw error(404, "Overtime request not found");
  return data;
};

export const managerOvertimeActionService = async (id, action, user, reason) => {
  const overtime = await getOvertimeRequestForDecision(id);
  if (overtime.status !== "pending") throw error(409, "This overtime request cannot be modified in its current state");
  if (overtime.manager_status !== "pending") throw error(409, "Manager has already taken action on this request");

  const actor = await employeeByAuth(user.auth_id || user.id);
  const now = new Date().toISOString();
  const isRejected = action === "rejected";

  if (!["approved", "rejected"].includes(action)) {
    throw error(422, "Invalid manager action");
  }

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
  } else {
    // Manager approved - keep status as "pending" for HR review
    updateData.status = "pending";
  }

  const { data, error: updateErr } = await supabase
    .from("overtime_requests")
    .update(updateData)
    .eq("id", id)
    .select(OVERTIME_APPROVAL_SELECT)
    .single();

  if (updateErr) throw error(400, updateErr.message);
  return data;
};

export const hrOvertimeActionService = async (id, action, user, reason) => {
  const overtime = await getOvertimeRequestForDecision(id);
  if (overtime.status !== "pending") throw error(409, "This overtime request cannot be modified in its current state");
  if (overtime.manager_status !== "approved") {
    throw error(409, "HR action is allowed only after manager approval");
  }
  if (overtime.hr_status !== "pending") throw error(409, "HR has already taken action on this request");

  const actor = await employeeByAuth(user.auth_id || user.id);
  const now = new Date().toISOString();
  const isApproved = action === "approved";
  const isRejected = action === "rejected";

  if (!["approved", "rejected"].includes(action)) {
    throw error(422, "Invalid HR action");
  }

  const updateData = {
    hr_status: action,
    hr_approved_at: now,
    updated_at: now,
    status: action,
  };

  if (isApproved) {
    updateData.approved_at = now;
    updateData.approved_by = actor?.id || null;
    updateData.is_paid = true;
    updateData.paid_at = now;
  }

  if (isRejected) {
    updateData.rejected_at = now;
    updateData.rejected_by = actor?.id || null;
    updateData.rejection_reason = reason || null;
    updateData.is_paid = false;
  }

  const { data, error: updateErr } = await supabase
    .from("overtime_requests")
    .update(updateData)
    .eq("id", id)
    .select(OVERTIME_APPROVAL_SELECT)
    .single();

  if (updateErr) throw error(400, updateErr.message);
  return data;
};

export const cancelOvertimeRequestService = async (id, userId) => {
  try {
    const requester = await employeeByAuth(userId);
    const overtimeReq = await getOvertimeRequestByIdService(id);

    if (overtimeReq.employee_id !== requester.id) {
      throw error(403, "You can only cancel your own overtime request");
    }

    ensurePendingStatus(overtimeReq, "cancel");

    return updateOvertimeRequestCancellation(id);
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getOvertimeRequestsService = async (filters, page, limit) => {
  try {
    let query = supabase
      .from("overtime_requests")
      .select(OVERTIME_SELECT, { count: "exact" });

    query = applyExactFilters(query, filters, ["employee_id", "status", "manager_status", "hr_status"]);

    const { data, error: err, count } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (err) throw error(400, err.message);

    return {
      data,
      pagination: toPagination(page, limit, count),
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getOvertimeRequestByIdService = async (id) => {
  try {
    const { data, error: err } = await supabase
      .from("overtime_requests")
      .select(OVERTIME_SELECT)
      .eq("id", id)
      .single();

    if (err && err.code === "PGRST116") {
      throw error(404, "Overtime request not found");
    }
    if (err) throw error(400, err.message);

    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};
