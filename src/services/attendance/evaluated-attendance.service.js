import { getAttendancePolicyById } from "../policy.service.js";
import { getSalaryStructure } from "../payroll/payroll.repository.js";
import { classifyBusinessDate, round2, toDateOnly } from "../payroll/payroll.utils.js";
import { resolveTimezone, toClockMinutesInTimezone } from "../../utils/timezone.js";

const DEFAULT_HALF_DAY_RATIO = 0.5;

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().split("T")[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
};

const resolvePolicyTimezone = (attendancePolicy = {}) =>
  resolveTimezone(
    attendancePolicy.timezone,
    process.env.ATTENDANCE_TIMEZONE,
    process.env.PAYROLL_POLICY_TIMEZONE,
    "Asia/Karachi"
  );

const getLeaveUnit = (leave, leaveRules = {}) => {
  const halfDayUnit = Number(leaveRules.half_day_unit ?? DEFAULT_HALF_DAY_RATIO);
  const hoursPerDayForShortLeave = Number(leaveRules.short_leave_hours_per_day ?? 8);

  if (!leave) return 0;
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

const getGraceMinutes = (attendancePolicy = {}, shift = {}) => {
  const defaultGrace = Number(attendancePolicy.grace_minutes_default ?? 0);
  const shiftGraceById = attendancePolicy.shift_grace_by_shift_id || {};
  const shiftGraceByName = attendancePolicy.shift_grace_by_shift_name || {};

  if (shift?.id && shiftGraceById[shift.id] !== undefined) {
    return Math.max(0, Number(shiftGraceById[shift.id]));
  }

  if (shift?.name && shiftGraceByName[shift.name] !== undefined) {
    return Math.max(0, Number(shiftGraceByName[shift.name]));
  }

  return Math.max(0, defaultGrace);
};

export const resolveEmployeeAttendancePolicy = async (employeeId) => {
  if (!employeeId) return null;

  const salaryStructure = await getSalaryStructure(employeeId).catch(() => null);
  if (!salaryStructure?.attendance_policy_id) return null;

  const policy = await getAttendancePolicyById(salaryStructure.attendance_policy_id).catch(() => null);
  return policy || null;
};

export const evaluateAttendanceRecord = ({
  date,
  attendanceRecord = null,
  leaveRecord = null,
  attendancePolicy = {},
  leaveRules = {},
  shift = null,
}) => {
  const normalizedDate = normalizeDate(date || attendanceRecord?.date || leaveRecord?.start_date);
  const calendar = classifyBusinessDate(normalizedDate, attendancePolicy || {});
  const timezone = resolvePolicyTimezone(attendancePolicy || {});

  const recordShift = shift || attendanceRecord?.shift || null;
  const shiftHours = Number(
    recordShift?.duration_hours ?? attendancePolicy?.standard_work_hours_per_day ?? 8
  );
  const halfDayThreshold = Number(
    attendancePolicy?.half_day_threshold_hours ?? Math.max(0.5, shiftHours * DEFAULT_HALF_DAY_RATIO)
  );

  const hasCheckIn = Boolean(attendanceRecord?.check_in_time);
  const hasCheckOut = Boolean(attendanceRecord?.check_out_time);
  const workedHours = round2(Number(attendanceRecord?.duration_hours || 0));
  const checkInMinutes = toClockMinutesInTimezone(attendanceRecord?.check_in_time, timezone);
  const shiftStartMinutes = toClockMinutesInTimezone(recordShift?.start_time, timezone);
  const graceMinutes = getGraceMinutes(attendancePolicy || {}, recordShift || {});
  const lateMinutes =
    hasCheckIn && shiftStartMinutes !== null && checkInMinutes !== null
      ? Math.max(0, checkInMinutes - (shiftStartMinutes + graceMinutes))
      : 0;

  const leaveUnit = leaveRecord ? getLeaveUnit(leaveRecord, leaveRules) : 0;
  const isLeaveDay = Boolean(leaveRecord) && !hasCheckIn;
  const isHoliday = !calendar.isWorkingDay && calendar.reason === "holiday";
  const isOffDay = !calendar.isWorkingDay && !isHoliday;

  // Policy-driven thresholds
  const minHoursForPresent = Number(attendancePolicy?.min_hours_for_present ?? 0);
  const minHoursForHalfDay = Number(attendancePolicy?.min_hours_for_half_day ?? halfDayThreshold);
  const fullDayHours = Number(attendancePolicy?.full_day_hours ?? shiftHours);
  const noCheckoutBehavior = String(attendancePolicy?.no_checkout_behavior ?? "present").toLowerCase();
  const shortHoursBehavior = String(attendancePolicy?.short_hours_behavior ?? "absent").toLowerCase();
  const shortHoursPayable = Number(attendancePolicy?.short_hours_payable ?? 0);

  let evaluatedStatus = "absent";
  let payableDayFraction = 0;

  if (isLeaveDay) {
    evaluatedStatus = "leave";
    payableDayFraction = leaveUnit;
  } else if (isHoliday) {
    evaluatedStatus = "holiday";
  } else if (isOffDay && !hasCheckIn) {
    evaluatedStatus = "off_day";
  } else if (hasCheckIn && !hasCheckOut) {
    // Policy-driven: No checkout behavior (present, absent, half_day)
    if (noCheckoutBehavior === "present") {
      evaluatedStatus = calendar.isWorkingDay ? "present" : "off_day_worked";
      payableDayFraction = 1;
    } else if (noCheckoutBehavior === "half_day") {
      evaluatedStatus = "half_day";
      payableDayFraction = 0.5;
    } else {
      evaluatedStatus = "absent";
      payableDayFraction = 0;
    }
  } else if (hasCheckIn && hasCheckOut) {
    // Policy-driven: Check worked_hours against policy thresholds
    if (workedHours >= fullDayHours || fullDayHours <= 0) {
      // Full day
      evaluatedStatus = calendar.isWorkingDay ? "present" : "off_day_worked";
      payableDayFraction = 1;
    } else if (workedHours >= minHoursForHalfDay) {
      // Half day
      evaluatedStatus = "half_day";
      payableDayFraction = 0.5;
    } else if (workedHours >= minHoursForPresent) {
      // Short hours: Use policy behavior (present, half_day, absent)
      if (shortHoursBehavior === "present") {
        evaluatedStatus = calendar.isWorkingDay ? "present" : "off_day_worked";
        payableDayFraction = round2(shortHoursPayable);
      } else if (shortHoursBehavior === "half_day") {
        evaluatedStatus = "half_day";
        payableDayFraction = 0.5;
      } else {
        evaluatedStatus = "absent";
        payableDayFraction = 0;
      }
    } else {
      // No work
      evaluatedStatus = "absent";
      payableDayFraction = 0;
    }
  } else if (calendar.isWorkingDay) {
    evaluatedStatus = "absent";
  }

  return {
    date: normalizedDate,
    evaluated_status: evaluatedStatus,
    day_type: calendar.reason,
    is_working_day: calendar.isWorkingDay,
    is_late: lateMinutes > 0,
    late_minutes: Math.round(lateMinutes),
    worked_hours: workedHours,
    shift_hours: round2(shiftHours),
    payable_day_fraction: round2(payableDayFraction),
    leave_unit: round2(leaveUnit),
    has_check_in: hasCheckIn,
    has_check_out: hasCheckOut,
    attendance_id: attendanceRecord?.id || null,
    leave_id: leaveRecord?.id || null,
    shift_id: recordShift?.id || attendanceRecord?.shift_id || null,
    notes: [
      calendar.reason,
      hasCheckIn ? "check_in" : null,
      hasCheckOut ? "check_out" : null,
      isLeaveDay ? "leave" : null,
    ].filter(Boolean),
  };
};

const groupAttendanceByDate = (attendanceRows = [], attendancePolicy = {}) => {
  const map = new Map();

  for (const row of attendanceRows) {
    if (!row?.date) continue;
    if (!classifyBusinessDate(row.date, attendancePolicy || {}).isWorkingDay) continue;

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

const groupLeavesByDate = (leaveRows = [], workingDates = []) => {
  const map = new Map();
  const workingDateSet = new Set(workingDates);

  for (const leave of leaveRows) {
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

export const evaluateAttendancePeriod = ({
  attendanceRows = [],
  leaveRows = [],
  assignmentsRows = [],
  periodBounds,
  attendancePolicy = {},
  leaveRules = {},
}) => {
  const workingDates = periodBounds?.workingDates || [];
  const attendanceByDate = groupAttendanceByDate(attendanceRows, attendancePolicy || {});
  const leaveByDate = groupLeavesByDate(leaveRows, workingDates);
  const shiftByDate = resolveShiftAssignmentByDate(assignmentsRows, workingDates);
  const evaluations = [];
  const dayStats = new Map();

  let presentDays = 0;
  let halfDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidayDays = 0;
  let offDays = 0;
  let lateArrivals = 0;

  for (const day of workingDates) {
    const attendance = attendanceByDate.get(day) || null;
    const leave = leaveByDate.get(day) || null;
    const shift = shiftByDate.get(day)?.shift || attendance?.shift || null;

    const evaluation = evaluateAttendanceRecord({
      date: day,
      attendanceRecord: attendance,
      leaveRecord: leave,
      attendancePolicy,
      leaveRules,
      shift,
    });

    evaluations.push({
      ...evaluation,
      attendance: attendance
        ? {
            id: attendance.id,
            check_in_time: attendance.check_in_time,
            check_out_time: attendance.check_out_time,
            status: attendance.status,
          }
        : null,
      leave: leave
        ? {
            id: leave.id,
            leave_type: leave.leave_type,
            status: leave.status,
          }
        : null,
      shift: shift
        ? {
            id: shift.id,
            name: shift.name,
            start_time: shift.start_time,
            end_time: shift.end_time,
            duration_hours: shift.duration_hours,
          }
        : null,
    });

    dayStats.set(day, evaluation);

    if (evaluation.evaluated_status === "present" || evaluation.evaluated_status === "off_day_worked") {
      presentDays += 1;
    } else if (evaluation.evaluated_status === "half_day") {
      halfDays += 1;
    } else if (evaluation.evaluated_status === "leave") {
      paidLeaveDays += evaluation.payable_day_fraction || 0;
    } else if (evaluation.evaluated_status === "absent") {
      unpaidLeaveDays += 1;
    } else if (evaluation.evaluated_status === "holiday") {
      holidayDays += 1;
    } else if (evaluation.evaluated_status === "off_day") {
      offDays += 1;
    }

    if (evaluation.is_late) {
      lateArrivals += 1;
    }
  }

  const halfDayUnits = round2(halfDays * DEFAULT_HALF_DAY_RATIO);
  const payableDays = round2(presentDays + halfDayUnits + paidLeaveDays);

  return {
    attendanceByDate,
    leaveByDate,
    shiftByDate,
    dayStats,
    evaluations,
    summary: {
      total_working_days: workingDates.length,
      present_days: round2(presentDays),
      half_days: round2(halfDays),
      half_day_units: halfDayUnits,
      paid_leave_days: round2(paidLeaveDays),
      unpaid_leave_days: round2(unpaidLeaveDays),
      holiday_days: round2(holidayDays),
      off_days: round2(offDays),
      payable_days: payableDays,
      late_arrivals: round2(lateArrivals),
    },
  };
};
