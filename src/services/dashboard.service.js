import { supabase } from "../config/supabase.js";
import {
  getApprovedRegularizationsForAttendanceIds,
  resolveEffectiveAttendanceStatus,
} from "./attendance/late-regularization.service.js";

const PRESENT_STATUSES = new Set(["online", "offline", "PRESENT", "ON_LEAVE_WORKING"]);
const ABSENT_STATUSES = new Set(["absent", "ABSENT"]);
const LEAVE_STATUSES = new Set(["leave", "ON_LEAVE"]);

const error = (status, message) => Object.assign(new Error(message), { status });

const toIsoDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().split("T")[0];
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const iso = `${yyyy}-${mm}-${dd}`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : iso;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
};

const getRangeFromFilters = (filters = {}) => {
  if (filters.start_date || filters.end_date) {
    const startDate = toIsoDate(filters.start_date) || toIsoDate(filters.end_date);
    const endDate = toIsoDate(filters.end_date) || startDate;
    return { startDate, endDate };
  }

  if (filters.month && filters.year) {
    const start = new Date(Date.UTC(Number(filters.year), Number(filters.month) - 1, 1));
    const end = new Date(Date.UTC(Number(filters.year), Number(filters.month), 0));
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }

  return getCurrentMonthRange();
};

const getEmployeeByAuthId = async (authId) => {
  const { data, error: err } = await supabase
    .from("employees")
    .select("id, first_name, last_name, designation, department")
    .eq("auth_id", authId)
    .maybeSingle();

  if (err) throw error(400, err.message);
  if (!data) throw error(404, "Employee not found");
  return data;
};

const getScopedFilters = async (authUser, rawFilters = {}) => {
  const actor = await getEmployeeByAuthId(authUser.auth_id || authUser.id);
  const scoped = { ...rawFilters };

  if (actor.designation === "employee") {
    scoped.employee_id = actor.id;
    delete scoped.department;
  }

  if (actor.designation === "manager" && !scoped.department) {
    scoped.department = actor.department;
  }

  return { actor, filters: scoped };
};

const applyAttendanceFilters = (query, filters) => {
  let q = query;

  if (filters.employee_id) q = q.eq("employee_id", filters.employee_id);
  if (filters.department) q = q.filter("employee.department", "eq", filters.department);

  return q;
};

const applyLeavesFilters = (query, filters) => {
  let q = query;

  if (filters.employee_id) q = q.eq("employee_id", filters.employee_id);
  if (filters.department) q = q.filter("employee.department", "eq", filters.department);

  return q;
};

const getRegularizationMapForAttendanceRows = async (rows = []) =>
  getApprovedRegularizationsForAttendanceIds((rows || []).map((row) => row?.id).filter(Boolean));

const getEffectiveStatus = (row, regularizationMap = new Map()) =>
  resolveEffectiveAttendanceStatus(row, regularizationMap.get(row?.id) || []).status;

const countAppliedRegularizations = (regularizationMap = new Map(), rows = []) => {
  const uniqueAttendanceIds = new Set((rows || []).map((row) => row?.id).filter(Boolean));
  let count = 0;

  for (const [attendanceId, items] of regularizationMap.entries()) {
    if (uniqueAttendanceIds.has(attendanceId)) {
      count += Number(items?.length || 0);
    }
  }

  return count;
};

const summarizeAttendanceRows = (rows, regularizationMap = new Map()) => {
  const summary = {
    total: rows.length,
    present: 0,
    absent: 0,
    on_leave: 0,
    holiday: 0,
    overtime_hours: 0,
    overtime_records: 0,
    approved_regularizations_applied: countAppliedRegularizations(regularizationMap, rows),
  };

  for (const row of rows) {
    const status = getEffectiveStatus(row, regularizationMap);
    if (PRESENT_STATUSES.has(status)) summary.present += 1;
    if (ABSENT_STATUSES.has(status)) summary.absent += 1;
    if (LEAVE_STATUSES.has(status)) summary.on_leave += 1;
    if (status === "holiday") summary.holiday += 1;

    const ot = Number(row.overtime_hours || 0);
    summary.overtime_hours += ot;
    if (ot > 0) summary.overtime_records += 1;
  }

  summary.overtime_hours = Number(summary.overtime_hours.toFixed(2));
  return summary;
};

const getTrendBucketKey = (dateString, groupBy) => {
  if (groupBy === "month") {
    return dateString.slice(0, 7);
  }

  if (groupBy === "week") {
    const d = new Date(dateString);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().split("T")[0];
  }

  return dateString;
};

const makeTrend = (rows, groupBy = "day", regularizationMap = new Map()) => {
  const bucket = new Map();

  for (const row of rows) {
    const key = getTrendBucketKey(row.date, groupBy);
    if (!bucket.has(key)) {
      bucket.set(key, {
        period: key,
        total: 0,
        present: 0,
        absent: 0,
        on_leave: 0,
        holiday: 0,
        overtime_hours: 0,
      });
    }

    const item = bucket.get(key);
    item.total += 1;
    const status = getEffectiveStatus(row, regularizationMap);
    if (PRESENT_STATUSES.has(status)) item.present += 1;
    if (ABSENT_STATUSES.has(status)) item.absent += 1;
    if (LEAVE_STATUSES.has(status)) item.on_leave += 1;
    if (status === "holiday") item.holiday += 1;
    item.overtime_hours = Number((item.overtime_hours + Number(row.overtime_hours || 0)).toFixed(2));
  }

  return [...bucket.values()].sort((a, b) => a.period.localeCompare(b.period));
};

const makeDepartmentSummary = (rows, regularizationMap = new Map()) => {
  const bucket = new Map();

  for (const row of rows) {
    const dept = row.employee?.department || "Unknown";
    if (!bucket.has(dept)) {
      bucket.set(dept, {
        department: dept,
        total: 0,
        present: 0,
        absent: 0,
        on_leave: 0,
        overtime_hours: 0,
      });
    }

    const item = bucket.get(dept);
    item.total += 1;
    const status = getEffectiveStatus(row, regularizationMap);
    if (PRESENT_STATUSES.has(status)) item.present += 1;
    if (ABSENT_STATUSES.has(status)) item.absent += 1;
    if (LEAVE_STATUSES.has(status)) item.on_leave += 1;
    item.overtime_hours = Number((item.overtime_hours + Number(row.overtime_hours || 0)).toFixed(2));
  }

  return [...bucket.values()].sort((a, b) => b.total - a.total);
};

const makeTopOvertimeEmployees = (rows, topN) => {
  const bucket = new Map();

  for (const row of rows) {
    const employeeId = row.employee_id;
    const overtimeHours = Number(row.overtime_hours || 0);
    if (overtimeHours <= 0) continue;

    if (!bucket.has(employeeId)) {
      bucket.set(employeeId, {
        employee_id: employeeId,
        employee_name: `${row.employee?.first_name || ""} ${row.employee?.last_name || ""}`.trim() || "Unknown",
        department: row.employee?.department || null,
        overtime_hours: 0,
        overtime_records: 0,
      });
    }

    const item = bucket.get(employeeId);
    item.overtime_hours = Number((item.overtime_hours + overtimeHours).toFixed(2));
    item.overtime_records += 1;
  }

  return [...bucket.values()]
    .sort((a, b) => b.overtime_hours - a.overtime_hours)
    .slice(0, topN);
};

const getEmployeesCount = async (filters) => {
  let q = supabase.from("employees").select("id, department", { count: "exact" });
  if (filters.department) q = q.eq("department", filters.department);
  if (filters.employee_id) q = q.eq("id", filters.employee_id);

  const { count, error: err } = await q;
  if (err) throw error(400, err.message);
  return count || 0;
};

const getPayrollSummary = async ({ startDate, endDate, filters }) => {
  let q = supabase
    .from("payrolls")
    .select("id, employee_id, status, month, year, net_salary, gross_salary, created_at");

  if (filters.employee_id) q = q.eq("employee_id", filters.employee_id);

  const { data, error: err } = await q;
  if (err) throw error(400, err.message);

  const start = new Date(startDate);
  const end = new Date(endDate);

  const inRange = (data || []).filter((row) => {
    const rowDate = new Date(row.created_at || `${row.year}-${String(row.month).padStart(2, "0")}-01`);
    return rowDate >= start && rowDate <= end;
  });

  return {
    total_payrolls: inRange.length,
    total_net_salary: Number(inRange.reduce((sum, row) => sum + Number(row.net_salary || 0), 0).toFixed(2)),
    total_gross_salary: Number(inRange.reduce((sum, row) => sum + Number(row.gross_salary || 0), 0).toFixed(2)),
    paid_count: inRange.filter((row) => row.status === "paid").length,
    processed_count: inRange.filter((row) => row.status === "processed").length,
    draft_count: inRange.filter((row) => row.status === "draft").length,
  };
};

const getPendingApprovals = async (filters) => {
  let leaveQ = supabase.from("leaves").select("id, employee_id, employee:employee_id(id, department)", { count: "exact" }).eq("status", "pending");
  let overtimeQ = supabase.from("overtime_requests").select("id, employee_id, employee:employee_id(id, department)", { count: "exact" }).eq("status", "pending");
  let shiftQ = supabase.from("shift_change_requests").select("id, employee_id, employee:employee_id(id, department)", { count: "exact" }).eq("status", "pending");
  let regularizationQ = supabase.from("late_regularizations").select("id, employee_id, employee:employee_id(id, department)", { count: "exact" }).eq("status", "pending");

  if (filters.employee_id) {
    leaveQ = leaveQ.eq("employee_id", filters.employee_id);
    overtimeQ = overtimeQ.eq("employee_id", filters.employee_id);
    shiftQ = shiftQ.eq("employee_id", filters.employee_id);
    regularizationQ = regularizationQ.eq("employee_id", filters.employee_id);
  }

  if (filters.department) {
    leaveQ = leaveQ.filter("employee.department", "eq", filters.department);
    overtimeQ = overtimeQ.filter("employee.department", "eq", filters.department);
    shiftQ = shiftQ.filter("employee.department", "eq", filters.department);
    regularizationQ = regularizationQ.filter("employee.department", "eq", filters.department);
  }

  const [leaveRes, overtimeRes, shiftRes, regularizationRes] = await Promise.all([
    leaveQ,
    overtimeQ,
    shiftQ,
    regularizationQ,
  ]);

  if (leaveRes.error) throw error(400, leaveRes.error.message);
  if (overtimeRes.error) throw error(400, overtimeRes.error.message);
  if (shiftRes.error) throw error(400, shiftRes.error.message);
  if (regularizationRes.error) throw error(400, regularizationRes.error.message);

  return {
    pending_leaves: leaveRes.count || 0,
    pending_overtime_requests: overtimeRes.count || 0,
    pending_shift_change_requests: shiftRes.count || 0,
    pending_late_regularizations: regularizationRes.count || 0,
  };
};

const getRecentRequests = async (filters) => {
  let leaveQ = supabase
    .from("leaves")
    .select("id, employee_id, status, leave_type, hr_status, is_paid, paid_at, submitted_at, employee:employee_id(id, first_name, last_name, department)")
    .order("submitted_at", { ascending: false })
    .limit(5);

  let overtimeQ = supabase
    .from("overtime_requests")
    .select("id, employee_id, status, date, manager_status, hr_status, is_paid, paid_at, requested_at, employee:employee_id(id, first_name, last_name, department)")
    .order("requested_at", { ascending: false })
    .limit(5);

  let shiftQ = supabase
    .from("shift_change_requests")
    .select("id, employee_id, status, request_date, requested_at, employee:employee_id(id, first_name, last_name, department)")
    .order("requested_at", { ascending: false })
    .limit(5);

  if (filters.employee_id) {
    leaveQ = leaveQ.eq("employee_id", filters.employee_id);
    overtimeQ = overtimeQ.eq("employee_id", filters.employee_id);
    shiftQ = shiftQ.eq("employee_id", filters.employee_id);
  }

  if (filters.department) {
    leaveQ = leaveQ.filter("employee.department", "eq", filters.department);
    overtimeQ = overtimeQ.filter("employee.department", "eq", filters.department);
    shiftQ = shiftQ.filter("employee.department", "eq", filters.department);
  }

  const [leaveRes, overtimeRes, shiftRes] = await Promise.all([leaveQ, overtimeQ, shiftQ]);

  if (leaveRes.error) throw error(400, leaveRes.error.message);
  if (overtimeRes.error) throw error(400, overtimeRes.error.message);
  if (shiftRes.error) throw error(400, shiftRes.error.message);

  return {
    leaves: leaveRes.data || [],
    overtime_requests: overtimeRes.data || [],
    shift_change_requests: shiftRes.data || [],
  };
};

const getAttendanceRowsInRange = async ({ startDate, endDate, filters }) => {
  let q = supabase
    .from("attendance_records")
    .select("id, employee_id, date, status, overtime_hours, check_in_time, check_out_time, employee:employee_id(id, first_name, last_name, department, designation)")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  q = applyAttendanceFilters(q, filters);

  const { data, error: err } = await q;
  if (err) throw error(400, err.message);

  return data || [];
};

const getLeaveRowsInRange = async ({ startDate, endDate, filters }) => {
  let q = supabase
    .from("leaves")
    .select("id, employee_id, status, leave_type, hr_status, is_paid, paid_at, total_days, start_date, end_date, submitted_at, employee:employee_id(id, first_name, last_name, department)")
    .gte("start_date", startDate)
    .lte("end_date", endDate)
    .order("submitted_at", { ascending: false });

  q = applyLeavesFilters(q, filters);

  const { data, error: err } = await q;
  if (err) throw error(400, err.message);

  return data || [];
};

const getTodayAttendance = async (filters) => {
  const today = new Date().toISOString().split("T")[0];
  let q = supabase
    .from("attendance_records")
    .select("id, employee_id, status, overtime_hours, check_in_time, check_out_time, employee:employee_id(id, first_name, last_name, department)")
    .eq("date", today);

  q = applyAttendanceFilters(q, filters);
  const { data, error: err } = await q;
  if (err) throw error(400, err.message);

  return { date: today, rows: data || [] };
};

export const getDashboardOverviewService = async (authUser, rawFilters = {}) => {
  const { actor, filters } = await getScopedFilters(authUser, rawFilters);
  const { startDate, endDate } = getRangeFromFilters(filters);

  const [employeesCount, todayAttendance, attendanceRows, leaveRows, pending, payrollSummary, recentRequests] = await Promise.all([
    getEmployeesCount(filters),
    getTodayAttendance(filters),
    getAttendanceRowsInRange({ startDate, endDate, filters }),
    getLeaveRowsInRange({ startDate, endDate, filters }),
    getPendingApprovals(filters),
    getPayrollSummary({ startDate, endDate, filters }),
    getRecentRequests(filters),
  ]);

  const regularizationMap = await getRegularizationMapForAttendanceRows([
    ...(todayAttendance.rows || []),
    ...(attendanceRows || []),
  ]);

  const todaySummary = summarizeAttendanceRows(todayAttendance.rows, regularizationMap);
  const rangeSummary = summarizeAttendanceRows(attendanceRows, regularizationMap);

  const leavesSummary = {
    total: leaveRows.length,
    approved: leaveRows.filter((l) => l.status === "approved").length,
    pending: leaveRows.filter((l) => l.status === "pending").length,
    rejected: leaveRows.filter((l) => l.status === "rejected").length,
    cancelled: leaveRows.filter((l) => l.status === "cancelled").length,
    total_days: Number(leaveRows.reduce((sum, row) => sum + Number(row.total_days || 0), 0).toFixed(2)),
  };

  const employeePanel = actor.designation === "employee"
    ? {
        profile: {
          id: actor.id,
          first_name: actor.first_name,
          last_name: actor.last_name,
          designation: actor.designation,
          department: actor.department,
        },
        today: todayAttendance.rows[0] || null,
      }
    : null;

  return {
    role_scope: actor.designation,
    filters: {
      start_date: startDate,
      end_date: endDate,
      department: filters.department || null,
      employee_id: filters.employee_id || null,
    },
    workforce: {
      total_employees: employeesCount,
    },
    attendance_today: {
      date: todayAttendance.date,
      ...todaySummary,
    },
    attendance_in_range: rangeSummary,
    leaves: leavesSummary,
    approvals: pending,
    payroll: payrollSummary,
    recent_requests: recentRequests,
    employee_panel: employeePanel,
  };
};

export const getCombinedAttendanceAnalyticsService = async (authUser, rawFilters = {}) => {
  const { actor, filters } = await getScopedFilters(authUser, rawFilters);
  const { startDate, endDate } = getRangeFromFilters(filters);
  const topN = Number(rawFilters.top_n || 10);

  const [attendanceRows, leaveRows, pending] = await Promise.all([
    getAttendanceRowsInRange({ startDate, endDate, filters }),
    getLeaveRowsInRange({ startDate, endDate, filters }),
    getPendingApprovals(filters),
  ]);

  const regularizationMap = await getRegularizationMapForAttendanceRows(attendanceRows || []);

  const statusBreakdown = summarizeAttendanceRows(attendanceRows, regularizationMap);
  const trend = makeTrend(attendanceRows, rawFilters.group_by || "day", regularizationMap);
  const departmentSummary = makeDepartmentSummary(attendanceRows, regularizationMap);
  const topOvertimeEmployees = makeTopOvertimeEmployees(attendanceRows, topN);

  const leaveBreakdown = {
    total_requests: leaveRows.length,
    approved: leaveRows.filter((l) => l.status === "approved").length,
    pending: leaveRows.filter((l) => l.status === "pending").length,
    rejected: leaveRows.filter((l) => l.status === "rejected").length,
    cancelled: leaveRows.filter((l) => l.status === "cancelled").length,
    total_leave_days: Number(leaveRows.reduce((sum, row) => sum + Number(row.total_days || 0), 0).toFixed(2)),
  };

  return {
    role_scope: actor.designation,
    filters: {
      start_date: startDate,
      end_date: endDate,
      department: filters.department || null,
      employee_id: filters.employee_id || null,
      top_n: topN,
      group_by: rawFilters.group_by || "day",
    },
    sections: {
      kpis: statusBreakdown,
      status_breakdown: {
        present: statusBreakdown.present,
        absent: statusBreakdown.absent,
        on_leave: statusBreakdown.on_leave,
        holiday: statusBreakdown.holiday,
      },
      attendance_trend: trend,
      department_summary: departmentSummary,
      overtime: {
        total_hours: statusBreakdown.overtime_hours,
        records_with_overtime: statusBreakdown.overtime_records,
        top_employees: topOvertimeEmployees,
      },
      leaves: leaveBreakdown,
      pending_approvals: pending,
    },
  };
};
