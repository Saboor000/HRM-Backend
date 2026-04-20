import { supabase } from "../../config/supabase.js";
import { resolveTimezone, toClockMinutesInTimezone } from "../../utils/timezone.js";
import { applyOvertimeConstraints } from "./payroll.overtime.js";
import { DEFAULT_POLICY_TIMEZONE, LATE_ARRIVAL_PENALTY_STEP, error, getPeriodBounds, isBusinessDay, round2, toDateOnly } from "./payroll.utils.js";

const getLeaveUnit = (leave, leaveRules = {}) => {
  const halfDayUnit = Number(leaveRules.half_day_unit ?? 0.5);
  const hoursPerDayForShortLeave = Number(leaveRules.short_leave_hours_per_day ?? 8);

  if (leave.leave_type === "half_day") return halfDayUnit;
  if (leave.leave_type === "short_leave") {
    if (leave.total_hours !== null && leave.total_hours !== undefined) {
      return round2(Number(leave.total_hours || 0) / hoursPerDayForShortLeave);
    }

    const startTime = leave.start_time || "00:00";
    const endTime = leave.end_time || "00:00";
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    return round2(
      Math.max(0, ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60 / hoursPerDayForShortLeave)
    );
  }

  return 1;
};

const groupAttendanceByDate = (attendanceRows, attendanceRules = {}) => {
  const map = new Map();

  for (const row of attendanceRows || []) {
    if (!isBusinessDay(row.date, attendanceRules)) continue;
    // Always use the actual status from DB, do not overwrite
    const existing = map.get(row.date);
    if (!existing) {
      map.set(row.date, row);
      continue;
    }
    const existingStamp = existing.updated_at || existing.created_at || existing.check_in_time || "";
    const currentStamp = row.updated_at || row.created_at || row.check_in_time || "";
    if (String(currentStamp) >= String(existingStamp)) {
      map.set(row.date, row);
    }
  }

  return map;
};

const groupLeavesByDate = (leaveRows, workingDates) => {
  const map = new Map();
  const workingDateSet = new Set(workingDates);

  for (const leave of leaveRows || []) {
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date || leave.start_date);

    while (start <= end) {
      const day = toDateOnly(start);
      if (workingDateSet.has(day)) {
        map.set(day, leave);
      }
      start.setDate(start.getDate() + 1);
    }
  }

  return map;
};

const isLeavePaidByPolicy = (leave) => {
  if (!leave) return false;
  const status = String(leave.status || "").toLowerCase();
  const hrStatus = String(leave.hr_status || "").toLowerCase();
  return status === "approved" || hrStatus === "approved" || Boolean(leave.approved_by);
};

const resolveShiftAssignmentByDate = (assignments = [], workingDates = []) => {
  const resolved = new Map();

  const sortedAssignments = [...assignments].sort((a, b) =>
    String(b.assigned_from || "").localeCompare(String(a.assigned_from || ""))
  );

  for (const day of workingDates) {
    const hit = sortedAssignments.find((assignment) => {
      const from = assignment.assigned_from;
      const to = assignment.assigned_to || "9999-12-31";
      return String(from) <= String(day) && String(day) <= String(to);
    });

    if (hit) {
      resolved.set(day, hit);
    }
  }

  return resolved;
};

const countShiftBasedLateArrivals = ({ attendanceByDate, shiftByDate, attendanceRules = {} }) => {
  const defaultGraceMinutes = Number(attendanceRules.grace_minutes_default ?? 0);
  const shiftGraceById = attendanceRules.shift_grace_by_shift_id || {};
  const shiftGraceByName = attendanceRules.shift_grace_by_shift_name || {};
  const policyTimezone = resolveTimezone(
    attendanceRules.timezone,
    process.env.PAYROLL_POLICY_TIMEZONE,
    process.env.ATTENDANCE_TIMEZONE,
    DEFAULT_POLICY_TIMEZONE
  );

  let lateCount = 0;
  const details = [];

  for (const [day, attendance] of attendanceByDate.entries()) {
    if (!attendance?.check_in_time) continue;

    const assignment = shiftByDate.get(day);
    const shift = assignment?.shift || null;
    const shiftStart = shift?.start_time || null;
    const shiftStartMinutes = toClockMinutesInTimezone(shiftStart, policyTimezone);
    const checkInMinutes = toClockMinutesInTimezone(attendance.check_in_time, policyTimezone);

    if (shiftStartMinutes === null || checkInMinutes === null) continue;

    const shiftGrace =
      shift?.id && shiftGraceById[shift.id] !== undefined
        ? Number(shiftGraceById[shift.id])
        : shift?.name && shiftGraceByName[shift.name] !== undefined
          ? Number(shiftGraceByName[shift.name])
          : defaultGraceMinutes;

    const allowedMinutes = shiftStartMinutes + Math.max(0, shiftGrace);
    const isLate = checkInMinutes > allowedMinutes;
    if (isLate) lateCount += 1;

    details.push({
      day,
      shift_id: shift?.id || null,
      shift_name: shift?.name || null,
      shift_start: shiftStart,
      grace_minutes: Math.max(0, shiftGrace),
      check_in_time: attendance.check_in_time,
      comparison_timezone: policyTimezone,
      is_late: isLate,
    });
  }

  return {
    count: lateCount,
    details,
    policy: {
      grace_minutes_default: defaultGraceMinutes,
      timezone: policyTimezone,
      shift_grace_by_shift_id: shiftGraceById,
      shift_grace_by_shift_name: shiftGraceByName,
    },
  };
};

const applySandwichLeaveAdjustments = ({ dayStats, workingDates, leaveRules = {} }) => {
  const sandwichEnabled = Boolean(leaveRules.sandwich_enabled);
  if (!sandwichEnabled) {
    return { added_unpaid_days: 0, sandwich_days: [], policy: { sandwich_enabled: false } };
  }

  const sandwichDays = [];

  for (let i = 1; i < workingDates.length - 1; i += 1) {
    const day = workingDates[i];
    const prev = dayStats.get(workingDates[i - 1]);
    const current = dayStats.get(day);
    const next = dayStats.get(workingDates[i + 1]);

    if (!prev || !current || !next) continue;

    const prevOnLeave = prev.leave_unit > 0;
    const nextOnLeave = next.leave_unit > 0;
    const currentWorked = current.present_portion > 0;

    if (prevOnLeave && nextOnLeave && !currentWorked && current.leave_unit === 0) {
      const before = current.unpaid_portion;
      current.unpaid_portion = 1;
      current.sandwich_applied = true;
      if (before < 1) {
        sandwichDays.push(day);
      }
    }
  }

  return {
    added_unpaid_days: round2(sandwichDays.length),
    sandwich_days: sandwichDays,
    policy: {
      sandwich_enabled: true,
    },
  };
};

export const getPayrollPeriodSnapshot = async (employeeId, month, year, payrollRules = {}) => {
  const attendanceRules = payrollRules?.attendance || {};
  const bounds = getPeriodBounds(month, year, attendanceRules);

  const [
    { data: attendanceRows, error: attendanceErr },
    { data: leaveRows, error: leaveErr },
    { data: overtimeRows, error: overtimeErr },
    { data: assignmentsRows, error: assignmentsErr },
  ] =
    await Promise.all([
      supabase
        .from("attendance_records")
        .select("id, date, check_in_time, check_out_time, status, duration_hours, overtime_hours, leave_override, notes, created_at, updated_at")
        .eq("employee_id", employeeId)
        .gte("date", bounds.startDate)
        .lte("date", bounds.endDate),
      supabase
        .from("leaves")
        .select("id, employee_id, leave_type, start_date, end_date, start_time, end_time, half_day_type, status, approved_by, hr_status, reason, total_days, total_hours, approved_at, rejected_at")
        .eq("employee_id", employeeId)
        .gte("end_date", bounds.startDate)
        .lte("start_date", bounds.endDate),
      supabase
        .from("overtime_requests")
        .select("id, date, hours, status, approved_by, approved_at, reason")
        .eq("employee_id", employeeId)
        .eq("status", "approved")
        .gte("date", bounds.startDate)
        .lte("date", bounds.endDate),
      supabase
        .from("employee_shift_assignments")
        .select(
          `
          id,
          assigned_from,
          assigned_to,
          shift:shift_id(id, name, start_time, end_time, duration_hours)
        `
        )
        .eq("employee_id", employeeId)
        .eq("is_active", true)
        .lte("assigned_from", bounds.endDate)
        .or(`assigned_to.is.null,assigned_to.gte.${bounds.startDate}`),
    ]);

  if (attendanceErr) throw error(400, attendanceErr.message);
  if (leaveErr) throw error(400, leaveErr.message);
  if (overtimeErr) throw error(400, overtimeErr.message);
  if (assignmentsErr) throw error(400, assignmentsErr.message);

  const attendanceByDate = groupAttendanceByDate(attendanceRows, attendanceRules);
  const leaveByDate = groupLeavesByDate(leaveRows, bounds.workingDates);
  const shiftByDate = resolveShiftAssignmentByDate(assignmentsRows || [], bounds.workingDates);
  const lateEvaluation = countShiftBasedLateArrivals({
    attendanceByDate,
    shiftByDate,
    attendanceRules,
  });
  const overtimeEvaluation = applyOvertimeConstraints(overtimeRows || [], payrollRules?.overtime || {});

  const dayStats = new Map();

  let presentDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;

  for (const day of bounds.workingDates) {
    const attendance = attendanceByDate.get(day);
    const leave = leaveByDate.get(day);
    // Payroll presence is determined ONLY by check_in_time, not by status.
    // This ensures any check-in (regardless of status: online, offline, etc.) counts as present.
    const hasPunch = Boolean(attendance?.check_in_time);
    const leaveUnit = leave ? Math.min(1, Math.max(0, getLeaveUnit(leave, payrollRules?.leave || {}))) : 0;

    let presentPortion = 0;
    let paidPortion = 0;
    let unpaidPortion = 0;

    if (hasPunch) {
      presentPortion = 1;
    } else if (!leave) {
      unpaidPortion = 1;
    } else {
      const isPaidLeave = isLeavePaidByPolicy(leave);
      if (isPaidLeave) {
        paidPortion += leaveUnit;
      } else {
        unpaidPortion += leaveUnit;
      }
      if (leaveUnit < 1) {
        unpaidPortion += round2(1 - leaveUnit);
      }
    }

    dayStats.set(day, {
      day,
      leave_unit: leaveUnit,
      present_portion: round2(presentPortion),
      paid_portion: round2(paidPortion),
      unpaid_portion: round2(unpaidPortion),
      sandwich_applied: false,
      has_punch: hasPunch,
      leave_id: leave?.id || null,
      // NOTE: present_portion is set ONLY by check_in_time, not by status.
    });
  }

  const sandwichEvaluation = applySandwichLeaveAdjustments({
    dayStats,
    workingDates: bounds.workingDates,
    leaveRules: payrollRules?.leave || {},
  });

  for (const day of bounds.workingDates) {
    const s = dayStats.get(day);
    if (!s) continue;
    presentDays += Number(s.present_portion || 0);
    paidLeaveDays += Number(s.paid_portion || 0);
    unpaidLeaveDays += Number(s.unpaid_portion || 0);
  }

  const overtimeHours = overtimeEvaluation.accepted_hours;
  const lateArrivals = lateEvaluation.count;

  // Filter attendanceRows for this employee and working days, and include all records
  const filteredAttendanceRows = (attendanceRows || []).filter(r => r.employee_id === employeeId || !r.employee_id);
  return {
    ...bounds,
    attendanceRows: filteredAttendanceRows,
    leaveRows: leaveRows || [],
    overtimeRows: overtimeRows || [],
    attendanceSummary: {
      total_working_days: bounds.workingDays,
      non_working_days: (bounds.nonWorkingDates || []).length,
      non_working_dates: bounds.nonWorkingDates || [],
      present_days: round2(presentDays),
      absent_days: round2(unpaidLeaveDays),
      overtime_hours: round2(overtimeHours),
      late_arrivals: lateArrivals,
      late_penalty_days: 0,
      late_penalty_rule: {
        late_count_for_unpaid_day: Number(payrollRules?.attendance?.late_count_for_unpaid_day || LATE_ARRIVAL_PENALTY_STEP),
        computed_unpaid_days_from_late: Math.floor(
          lateArrivals / Number(payrollRules?.attendance?.late_count_for_unpaid_day || LATE_ARRIVAL_PENALTY_STEP)
        ),
        applied_unpaid_days_from_late: 0,
      },
      late_evaluation: lateEvaluation,
      overtime_policy: overtimeEvaluation.policy,
      overtime_violations: overtimeEvaluation.violations,
      sandwich_policy: sandwichEvaluation.policy,
      sandwich_days: sandwichEvaluation.sandwich_days,
      sandwich_added_unpaid_days: sandwichEvaluation.added_unpaid_days,
    },
    leaveSummary: {
      paid_leave_days: round2(paidLeaveDays),
      unpaid_leave_days: round2(unpaidLeaveDays),
    },
  };
};
