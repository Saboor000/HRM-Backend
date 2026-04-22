import { round2, toDateOnly } from "./payroll.utils.js";

/**
 * Evaluates overtime from actual attendance records by comparing worked hours to shift hours.
 * This is the attendance-based source of truth for overtime (replacing approved overtime_requests).
 * 
 * @param {Array} attendanceRows - Attendance records with duration_hours
 * @param {Map} shiftByDate - Map of date -> shift assignment with shift.duration_hours
 * @param {Object} overtimePolicy - Policy object with require_full_shift_for_overtime, standard_work_hours_per_day
 * @returns {Array} Array of {date, hours} objects compatible with applyOvertimeConstraints
 */
export const evaluateOvertimeFromAttendance = (attendanceRows = [], shiftByDate = new Map(), overtimePolicy = {}) => {
  const requireFullShift = Boolean(overtimePolicy.require_full_shift_for_overtime ?? true);
  const standardHours = Number(overtimePolicy.standard_work_hours_per_day ?? 8);

  const overtimeHoursByDate = new Map();

  for (const attendance of attendanceRows) {
    const day = toDateOnly(attendance.date);
    const actualHours = Number(attendance.duration_hours || 0);

    if (actualHours <= 0) continue; // No work, no overtime

    const shiftAssignment = shiftByDate.get(day);
    const shiftHours = shiftAssignment?.shift?.duration_hours 
      ? Number(shiftAssignment.shift.duration_hours) 
      : standardHours;

    // Calculate raw overtime: hours beyond shift duration
    let rawOvertime = Math.max(0, round2(actualHours - shiftHours));

    // If require_full_shift_for_overtime is true, only count hours beyond full shift
    // This prevents late compensation (or partial day work) from being counted as overtime
    if (requireFullShift && actualHours < shiftHours) {
      rawOvertime = 0; // Cannot have overtime without completing the full shift
    }

    if (rawOvertime > 0) {
      overtimeHoursByDate.set(day, round2(rawOvertime));
    }
  }

  // Convert Map to array format compatible with applyOvertimeConstraints
  return Array.from(overtimeHoursByDate.entries()).map(([date, hours]) => ({
    date,
    hours,
  }));
};

export const applyOvertimeConstraints = (overtimeRows, overtimeRules = {}) => {
  const minPerDay = Number(overtimeRules.min_hours_per_day ?? 2);
  const maxPerDay = Number(overtimeRules.max_hours_per_day ?? 4);
  const maxPerMonth = Number(overtimeRules.max_hours_per_month ?? 20);

  const byDate = new Map();
  for (const row of overtimeRows || []) {
    const day = row.date;
    byDate.set(day, (byDate.get(day) || 0) + Number(row.hours || 0));
  }

  const violations = [];
  let monthlyTotal = 0;
  for (const [day, rawHours] of byDate.entries()) {
    let acceptedHours = rawHours;

    if (rawHours < minPerDay) {
      acceptedHours = 0;
      violations.push({ day, type: "below_daily_min", raw_hours: round2(rawHours), accepted_hours: 0 });
    } else if (rawHours > maxPerDay) {
      acceptedHours = maxPerDay;
      violations.push({ day, type: "above_daily_max", raw_hours: round2(rawHours), accepted_hours: round2(acceptedHours) });
    }

    byDate.set(day, round2(acceptedHours));
    monthlyTotal += acceptedHours;
  }

  monthlyTotal = round2(monthlyTotal);
  if (monthlyTotal > maxPerMonth) {
    const overflow = round2(monthlyTotal - maxPerMonth);
    let remainingOverflow = overflow;

    const datesDesc = [...byDate.keys()].sort((a, b) => String(b).localeCompare(String(a)));
    for (const day of datesDesc) {
      if (remainingOverflow <= 0) break;
      const current = Number(byDate.get(day) || 0);
      if (current <= 0) continue;
      const reduced = Math.max(0, round2(current - remainingOverflow));
      const used = round2(current - reduced);
      byDate.set(day, reduced);
      remainingOverflow = round2(Math.max(0, remainingOverflow - used));
    }

    monthlyTotal = maxPerMonth;
    violations.push({
      type: "above_monthly_cap",
      raw_monthly_hours: round2(monthlyTotal + overflow),
      accepted_monthly_hours: round2(monthlyTotal),
      reduced_hours: overflow,
    });
  }

  return {
    accepted_hours: round2(monthlyTotal),
    by_date: Object.fromEntries(byDate.entries()),
    violations,
    policy: {
      min_hours_per_day: minPerDay,
      max_hours_per_day: maxPerDay,
      max_hours_per_month: maxPerMonth,
    },
  };
};

/**
 * Separates potential overtime into approved vs unapproved portions.
 * - Approved overtime: paid at overtime rate
 * - Unapproved overtime: paid as regular working hours
 * 
 * @param {Array} potentialOvertimeRows - Computed overtime from attendance [{date, hours}]
 * @param {Array} approvedOvertimeRequests - Approved overtime requests from DB [{date, hours, status}]
 * @returns {Object} { approved_hours_by_date: Map, unapproved_hours_by_date: Map, summary: {...} }
 */
export const separateApprovedOvertimeByApproval = (potentialOvertimeRows = [], approvedOvertimeRequests = []) => {
  const potentialByDate = new Map();
  for (const row of potentialOvertimeRows) {
    const day = row.date;
    potentialByDate.set(day, (potentialByDate.get(day) || 0) + Number(row.hours || 0));
  }

  const approvedByDate = new Map();
  for (const req of approvedOvertimeRequests) {
    const day = req.date;
    approvedByDate.set(day, (approvedByDate.get(day) || 0) + Number(req.hours || 0));
  }

  const approvedOvertimeByDate = new Map();
  const unapprovedOvertimeByDate = new Map();

  for (const [day, potentialHours] of potentialByDate.entries()) {
    const approvedHours = approvedByDate.get(day) || 0;
    
    if (approvedHours >= potentialHours) {
      // All potential overtime is covered by approval
      approvedOvertimeByDate.set(day, round2(potentialHours));
    } else if (approvedHours > 0) {
      // Partial approval: split
      approvedOvertimeByDate.set(day, round2(approvedHours));
      unapprovedOvertimeByDate.set(day, round2(potentialHours - approvedHours));
    } else {
      // No approval: all becomes working hours
      unapprovedOvertimeByDate.set(day, round2(potentialHours));
    }
  }

  // Calculate summary totals
  let totalApprovedOvertime = 0;
  let totalUnapprovedOvertime = 0;
  for (const hours of approvedOvertimeByDate.values()) {
    totalApprovedOvertime += hours;
  }
  for (const hours of unapprovedOvertimeByDate.values()) {
    totalUnapprovedOvertime += hours;
  }

  return {
    approved_hours_by_date: approvedOvertimeByDate,
    unapproved_hours_by_date: unapprovedOvertimeByDate,
    summary: {
      total_potential_overtime: round2(Array.from(potentialByDate.values()).reduce((sum, h) => sum + h, 0)),
      total_approved_overtime: round2(totalApprovedOvertime),
      total_unapproved_overtime: round2(totalUnapprovedOvertime),
      unapproved_overtime_added_to_working_hours: round2(totalUnapprovedOvertime),
    },
  };
};
