import { supabase } from "../../config/supabase.js";
import { employeeByAuth, getEmployeeCurrentShiftService } from "./assignment.service.js";
import {
  formatTimestampInTimezone,
  getDateInTimezone,
  resolveTimezone,
  toClockMinutesInTimezone,
} from "../../utils/timezone.js";

const error = (status, message) => Object.assign(new Error(message), { status });
const ATTENDANCE_TIMEZONE = resolveTimezone(
  process.env.ATTENDANCE_TIMEZONE,
  process.env.PAYROLL_POLICY_TIMEZONE,
  "Asia/Karachi"
);
const todayDate = () => getDateInTimezone(ATTENDANCE_TIMEZONE);
const nowIso = () => new Date().toISOString();
const withServiceError = (err) => {
  if (err?.status) throw err;
  throw error(400, err.message);
};

const ATTENDANCE_STATUS = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  ON_LEAVE: "ON_LEAVE",
  ON_LEAVE_WORKING: "ON_LEAVE_WORKING",
};

const PUNCH_STATUS = {
  NOT_CHECKED_IN: "NOT_CHECKED_IN",
  CHECKED_IN: "CHECKED_IN",
  CHECKED_OUT: "CHECKED_OUT",
};

const LEGACY_STATUS = {
  ONLINE: "online",
  OFFLINE: "offline",
  LEAVE: "leave",
  ABSENT: "absent",
};

const selectAttendanceWithShift = `
  *,
  employee:employee_id(id, auth_id, first_name, last_name, designation, department),
  shift:shift_id(id, name, start_time, end_time, duration_hours, is_active)
`;
const parseDbTimestamp = (value) => {
  if (!value) return null;
  const raw = String(value);
  const hasTimezone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw);
  const parsed = new Date(hasTimezone ? raw : `${raw}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const resolveOvertimePolicyForEmployee = async (employeeId) => {
  const { data: structure, error: structureErr } = await supabase
    .from("salary_structures")
    .select("overtime_policy_id")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (structureErr) throw error(400, structureErr.message);
  if (!structure?.overtime_policy_id) return null;

  const { data: policy, error: policyErr } = await supabase
    .from("overtime_policies")
    .select("*")
    .eq("id", structure.overtime_policy_id)
    .maybeSingle();

  if (policyErr) throw error(400, policyErr.message);
  return policy || null;
};

const computeWorkMetrics = ({ checkInIso, checkOutIso, workedHours, shift, policy }) => {
  const shiftHours = Number(shift?.duration_hours || policy?.standard_work_hours_per_day || 8);
  const shiftStartMinutes = toClockMinutesInTimezone(shift?.start_time, ATTENDANCE_TIMEZONE);
  const shiftEndRawMinutes = toClockMinutesInTimezone(shift?.end_time, ATTENDANCE_TIMEZONE);
  const checkInRawMinutes = toClockMinutesInTimezone(checkInIso, ATTENDANCE_TIMEZONE);
  const checkOutRawMinutes = toClockMinutesInTimezone(checkOutIso, ATTENDANCE_TIMEZONE);

  const shiftEndMinutes =
    shiftStartMinutes !== null && shiftEndRawMinutes !== null && shiftEndRawMinutes <= shiftStartMinutes
      ? shiftEndRawMinutes + 1440
      : shiftEndRawMinutes;

  const normalizeToShiftWindow = (minutes) =>
    shiftStartMinutes !== null && minutes !== null && minutes < shiftStartMinutes ? minutes + 1440 : minutes;

  const checkInMinutes = normalizeToShiftWindow(checkInRawMinutes);
  const checkOutMinutes = normalizeToShiftWindow(checkOutRawMinutes);

  const lateMinutes =
    shiftStartMinutes !== null && checkInMinutes !== null
      ? Math.max(0, checkInMinutes - shiftStartMinutes)
      : 0;

  const earlyExitMinutes =
    shiftEndMinutes !== null && checkOutMinutes !== null
      ? Math.max(0, shiftEndMinutes - checkOutMinutes)
      : 0;

  const requireFullShift = policy?.require_full_shift_for_overtime !== false;
  const strictOvertimeEligible = requireFullShift
    ? Math.max(0, workedHours - shiftHours - lateMinutes / 60)
    : Math.max(0, workedHours - shiftHours);

  return {
    shift_hours: round2(shiftHours),
    worked_hours: round2(workedHours),
    late_minutes: Math.round(lateMinutes),
    early_exit_minutes: Math.round(earlyExitMinutes),
    require_full_shift_for_overtime: requireFullShift,
    overtime_hours: round2(strictOvertimeEligible),
  };
};

const normalizeStatus = (status) => {
  if (status === LEGACY_STATUS.ONLINE || status === LEGACY_STATUS.OFFLINE) {
    return ATTENDANCE_STATUS.PRESENT;
  }

  if (status === LEGACY_STATUS.LEAVE) {
    return ATTENDANCE_STATUS.ON_LEAVE;
  }

  if (status === LEGACY_STATUS.ABSENT) {
    return ATTENDANCE_STATUS.ABSENT;
  }

  if (Object.values(ATTENDANCE_STATUS).includes(status)) {
    return status;
  }

  return ATTENDANCE_STATUS.PRESENT;
};

const buildAttendanceResponse = (record, leaveRecord = null) => {
  if (!record) return record;

  const normalized = normalizeStatus(record.status);
  const hasCheckedIn = Boolean(record.check_in_time);
  const hasCheckedOut = Boolean(record.check_out_time);
  const storedOverride = Boolean(record.leave_override);
  const onLeaveDay = Boolean(leaveRecord);
  const isWorkingOnLeave = (storedOverride || onLeaveDay) && hasCheckedIn && !hasCheckedOut;
  const isPureLeaveRow = (normalized === ATTENDANCE_STATUS.ON_LEAVE || record.status === LEGACY_STATUS.LEAVE) && !hasCheckedIn;

  const punchStatus = hasCheckedIn ? (hasCheckedOut ? PUNCH_STATUS.CHECKED_OUT : PUNCH_STATUS.CHECKED_IN) : PUNCH_STATUS.NOT_CHECKED_IN;
  const workedHours = round2(Number(record.duration_hours || 0));
  const shiftHours = record?.shift?.duration_hours !== undefined && record?.shift?.duration_hours !== null
    ? round2(Number(record.shift.duration_hours || 0))
    : null;
  const lateMinutes = Math.max(0, Number(record.late_minutes || 0));
  const eligibleOvertimeHours = round2(Number(record.overtime_hours || 0));

  return {
    ...record,
    status: isPureLeaveRow ? ATTENDANCE_STATUS.ON_LEAVE : isWorkingOnLeave ? ATTENDANCE_STATUS.ON_LEAVE_WORKING : normalized,
    leave_override: Boolean(storedOverride || isWorkingOnLeave),
    punch_status: punchStatus,
    attendance_timezone: ATTENDANCE_TIMEZONE,
    check_in_time_local: formatTimestampInTimezone(record.check_in_time, ATTENDANCE_TIMEZONE),
    check_out_time_local: formatTimestampInTimezone(record.check_out_time, ATTENDANCE_TIMEZONE),
    worked_hours: workedHours,
    shift_hours: shiftHours,
    late_minutes: lateMinutes,
    eligible_overtime_hours: eligibleOvertimeHours,
    leave_id: leaveRecord?.id || null,
    leave_type: leaveRecord?.leave_type || null,
  };
};

export const checkLeaveConflict = async (employeeId, date) => {
  try {
    const { data, error: err } = await supabase
      .from("leaves")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .or(
        `and(leave_type.eq.full_day,start_date.lte.${date},end_date.gte.${date}),` +
          `and(leave_type.eq.half_day,start_date.eq.${date}),` +
          `and(leave_type.eq.short_leave,start_date.eq.${date})`
      )
      .maybeSingle();

    if (err) throw error(400, err.message);
    return data;
  } catch (e) {
    if (e.status) throw e;
    return null;
  }
};

export const checkEmployeeLeaveForDate = checkLeaveConflict;

export const getEmployeeLeavesInRange = async (employeeId, startDate, endDate) => {
  try {
    const { data, error: err } = await supabase
      .from("leaves")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .gte("end_date", startDate)
      .lte("start_date", endDate)
      .order("start_date", { ascending: true });

    if (err) throw error(400, err.message);
    return data || [];
  } catch (e) {
    if (e.status) throw e;
    return [];
  }
};

const getAttendanceForDate = async (employeeId, date) => {
  const { data, error: err } = await supabase
    .from("attendance_records")
    .select(selectAttendanceWithShift)
    .eq("employee_id", employeeId)
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (err) throw error(400, err.message);
  return data;
};

const getOpenAttendanceRecord = async (employeeId) => {
  const { data, error: err } = await supabase
    .from("attendance_records")
    .select(selectAttendanceWithShift)
    .eq("employee_id", employeeId)
    .not("check_in_time", "is", null)
    .is("check_out_time", null)
    .neq("status", LEGACY_STATUS.LEAVE)
    .order("check_in_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (err) throw error(400, err.message);
  return data;
};

const getCurrentShift = async (employeeId, date) => {
  const assignment = await getEmployeeCurrentShiftService(employeeId, date);
  return assignment?.shift ? assignment : null;
};

const requireActiveShift = (shift) => {
  if (shift && !shift.is_active) {
    throw error(400, "Shift is inactive for today");
  }
};
const requireShiftOrLeave = (assignment, leaveRecord) => {
  if (!assignment && !leaveRecord) {
    throw error(400, "No shift assigned for today");
  }
};

const reopenCompletedSameDayRecord = async (record, assignment, payload, leaveRecord) => {
  const checkInTime = nowIso();

  const { data, error: updateErr } = await supabase
    .from("attendance_records")
    .update({
      check_in_time: checkInTime,
      check_out_time: null,
      status: LEGACY_STATUS.ONLINE,
      leave_override: Boolean(leaveRecord),
      notes: payload.notes || record.notes || null,
      shift_id: assignment?.shift_id || record?.shift_id || null,
      duration_hours: 0,
      overtime_hours: 0,
      updated_at: checkInTime,
    })
    .eq("id", record.id)
    .select(selectAttendanceWithShift)
    .single();

  if (updateErr) throw error(400, updateErr.message);
  return buildAttendanceResponse(data, leaveRecord);
};

const ensureLeaveAttendanceRow = async (employeeId, date, leaveRecord) => {
  const existing = await getAttendanceForDate(employeeId, date);
  const now = nowIso();

  if (existing) {
    if (existing.check_in_time) {
      return existing;
    }

    const { data, error: err } = await supabase
      .from("attendance_records")
      .update({
        status: LEGACY_STATUS.LEAVE,
        notes: existing.notes || leaveRecord?.reason || null,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select(selectAttendanceWithShift)
      .single();

    if (err) throw error(400, err.message);
    return data;
  }

  const assignment = await getCurrentShift(employeeId, date);

  const { data, error: err } = await supabase
    .from("attendance_records")
    .insert({
      id: crypto.randomUUID(),
      employee_id: employeeId,
      date,
      check_in_time: null,
      check_out_time: null,
      status: LEGACY_STATUS.LEAVE,
      leave_override: false,
      notes: leaveRecord?.reason || null,
      shift_id: assignment?.shift_id || null,
      duration_hours: 0,
      overtime_hours: 0,
      created_at: now,
      updated_at: now,
    })
    .select(selectAttendanceWithShift)
    .single();

  if (err) throw error(400, err.message);
  return data;
};

export const checkInService = async (userId, payload) => {
  try {
    const employee = await employeeByAuth(userId);
    const today = todayDate();
    const leaveRecord = await checkLeaveConflict(employee.id, today);
    const existingToday = await getAttendanceForDate(employee.id, today);

    if (existingToday?.check_in_time && !existingToday.check_out_time) {
      throw error(409, "Already checked in. Please check out first.");
    }

    if (existingToday?.check_in_time && existingToday.check_out_time) {
      const assignment = await getCurrentShift(employee.id, today);
      requireShiftOrLeave(assignment, leaveRecord);
      requireActiveShift(assignment?.shift);

      return reopenCompletedSameDayRecord(existingToday, assignment, payload, leaveRecord);
    }

    const assignment = await getCurrentShift(employee.id, today);
    requireShiftOrLeave(assignment, leaveRecord);
    requireActiveShift(assignment?.shift);

    const checkInTime = nowIso();
    const basePayload = {
      check_in_time: checkInTime,
      check_out_time: null,
      status: LEGACY_STATUS.ONLINE,
      leave_override: Boolean(leaveRecord),
      notes: payload.notes || existingToday?.notes || null,
      shift_id: assignment?.shift_id || existingToday?.shift_id || null,
      updated_at: checkInTime,
    };

    let saved;

    if (existingToday && !existingToday.check_in_time) {
      const { data, error: updateErr } = await supabase
        .from("attendance_records")
        .update(basePayload)
        .eq("id", existingToday.id)
        .select(selectAttendanceWithShift)
        .single();

      if (updateErr) throw error(400, updateErr.message);
      saved = data;
    } else {
      const { data, error: insertErr } = await supabase
        .from("attendance_records")
        .insert({
          id: crypto.randomUUID(),
          employee_id: employee.id,
          date: today,
          check_in_time: checkInTime,
          check_out_time: null,
          status: LEGACY_STATUS.ONLINE,
          leave_override: Boolean(leaveRecord),
          notes: payload.notes || null,
          shift_id: assignment?.shift_id || null,
          duration_hours: 0,
          overtime_hours: 0,
          created_at: checkInTime,
          updated_at: checkInTime,
        })
        .select(selectAttendanceWithShift)
        .single();

      if (insertErr) throw error(400, insertErr.message);
      saved = data;
    }

    return buildAttendanceResponse(saved, leaveRecord);
  } catch (e) {
    withServiceError(e);
  }
};

export const checkOutService = async (userId, payload) => {
  try {
    const employee = await employeeByAuth(userId);
    const openRecord = await getOpenAttendanceRecord(employee.id);

    if (!openRecord) {
      const today = todayDate();
      const leaveRecord = await checkLeaveConflict(employee.id, today);
      if (leaveRecord) {
        await ensureLeaveAttendanceRow(employee.id, today, leaveRecord);
      }
      throw error(404, "No active check-in record found");
    }

    const checkInTime = parseDbTimestamp(openRecord.check_in_time);
    if (!checkInTime) {
      throw error(400, "Invalid attendance record: malformed check-in time");
    }

    const checkOutTime = new Date();
    const durationMinutes = Math.max(0, Math.floor((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60)));
    const durationHours = Math.round((durationMinutes / 60) * 100) / 100;
    const leaveRecord = await checkLeaveConflict(employee.id, openRecord.date);
    const overtimePolicy = await resolveOvertimePolicyForEmployee(employee.id);
    const workMetrics = computeWorkMetrics({
      checkInIso: openRecord.check_in_time,
      checkOutIso: checkOutTime.toISOString(),
      workedHours: durationHours,
      shift: openRecord.shift,
      policy: overtimePolicy,
    });

    const { data, error: err } = await supabase
      .from("attendance_records")
      .update({
        check_out_time: checkOutTime.toISOString(),
        status: LEGACY_STATUS.OFFLINE,
        leave_override: Boolean(leaveRecord),
        duration_hours: durationHours,
        overtime_hours: workMetrics.overtime_hours,
        late_minutes: workMetrics.late_minutes,
        early_exit_minutes: workMetrics.early_exit_minutes,
        notes: payload.notes || openRecord.notes,
        updated_at: checkOutTime.toISOString(),
      })
      .eq("id", openRecord.id)
      .select(selectAttendanceWithShift)
      .single();

    if (err) throw error(400, err.message);
    return {
      ...buildAttendanceResponse(data, leaveRecord),
      work_metrics: workMetrics,
    };
  } catch (e) {
    withServiceError(e);
  }
};

export const getCurrentStatusService = async (userId) => {
  try {
    const employee = await employeeByAuth(userId);
    const today = todayDate();
    const leaveRecord = await checkLeaveConflict(employee.id, today);
    const todayRecord = await getAttendanceForDate(employee.id, today);

    if (todayRecord) {
      if (leaveRecord && !todayRecord.check_in_time) {
        const leaveAttendance = await ensureLeaveAttendanceRow(employee.id, today, leaveRecord);
        return buildAttendanceResponse(leaveAttendance, leaveRecord);
      }

      return buildAttendanceResponse(todayRecord, leaveRecord);
    }

    if (leaveRecord) {
      const leaveAttendance = await ensureLeaveAttendanceRow(employee.id, today, leaveRecord);
      return buildAttendanceResponse(leaveAttendance, leaveRecord);
    }

    return {
      status: ATTENDANCE_STATUS.ABSENT,
      leave_override: false,
      punch_status: PUNCH_STATUS.NOT_CHECKED_IN,
      check_in_time: null,
      check_out_time: null,
    };
  } catch (e) {
    withServiceError(e);
  }
};
