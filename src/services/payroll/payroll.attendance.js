import { supabase } from "../../config/supabase.js";
import { applyOvertimeConstraints, evaluateOvertimeFromAttendance, separateApprovedOvertimeByApproval } from "./payroll.overtime.js";
import { LATE_ARRIVAL_PENALTY_STEP, error, getPeriodBounds, isBusinessDay, round2, toDateOnly } from "./payroll.utils.js";
import { evaluateAttendancePeriod } from "../attendance/evaluated-attendance.service.js";
import { getApprovedRegularizationsForAttendanceIds } from "../attendance/late-regularization.service.js";

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

export const getPayrollPeriodSnapshot = async (employeeId, month, year, payrollRules = {}) => {
  const attendanceRules = payrollRules?.attendance || {};
  const bounds = getPeriodBounds(month, year, attendanceRules);

  const [
    { data: attendanceRows, error: attendanceErr },
    { data: leaveRows, error: leaveErr },
    { data: overtimeApprovalsData, error: overtimeApprovalsErr },
    { data: assignmentsRows, error: assignmentsErr },
  ] =
    await Promise.all([
      supabase
        .from("attendance_records")
        .select(
          "id, date, shift_id, check_in_time, check_out_time, status, duration_hours, overtime_hours, leave_override, notes, created_at, updated_at, shift:shift_id(id, name, start_time, end_time, duration_hours)"
        )
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
  if (overtimeApprovalsErr) throw error(400, overtimeApprovalsErr.message);
  if (assignmentsErr) throw error(400, assignmentsErr.message);

  const attendanceByDate = groupAttendanceByDate(attendanceRows, attendanceRules);
  const leaveByDate = groupLeavesByDate(leaveRows, bounds.workingDates);
  const leaveById = new Map((leaveRows || []).map((leave) => [String(leave.id), leave]));
  const shiftByDate = resolveShiftAssignmentByDate(assignmentsRows || [], bounds.workingDates);
  const regularizationByAttendanceId = await getApprovedRegularizationsForAttendanceIds(
    (attendanceRows || []).map((row) => row.id).filter(Boolean)
  );
  const attendanceEvaluation = evaluateAttendancePeriod({
    attendanceRows: attendanceRows || [],
    leaveRows: leaveRows || [],
    assignmentsRows: assignmentsRows || [],
    regularizationByAttendanceId,
    periodBounds: bounds,
    attendancePolicy: attendanceRules,
    leaveRules: payrollRules?.leave || {},
  });
  const lateEvaluation = {
    count: Number(attendanceEvaluation.summary.late_arrivals || 0),
    details: attendanceEvaluation.evaluations.filter((entry) => entry.is_late),
    policy: {
      source: "attendance_evaluation",
    },
  };
  
  // Evaluate overtime from actual attendance records (attendance-based source of truth)
  const potentialOvertimeRows = evaluateOvertimeFromAttendance(
    attendanceRows || [],
    shiftByDate,
    payrollRules?.overtime || {}
  );
  
  // Separate approved vs unapproved overtime
  // - Approved: paid at overtime rate
  // - Unapproved: added back to working hours as regular time
  const overtimeApprovalSplit = separateApprovedOvertimeByApproval(
    potentialOvertimeRows,
    overtimeApprovalsData || []
  );
  
  // Apply constraints only to approved overtime
  const approvedOvertimeRows = Array.from(overtimeApprovalSplit.approved_hours_by_date.entries()).map(([date, hours]) => ({
    date,
    hours,
  }));
  const overtimeEvaluation = applyOvertimeConstraints(approvedOvertimeRows, payrollRules?.overtime || {});

  const evaluationByDate = new Map(
    (attendanceEvaluation?.evaluations || []).map((entry) => [String(entry.date), entry])
  );

  let presentDays = 0;
  let halfDays = 0;
  let halfDayUnits = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;

  for (const day of bounds.workingDates) {
    const evaluation = evaluationByDate.get(String(day)) || null;
    const payableFraction = round2(Number(evaluation?.payable_day_fraction || 0));
    const leaveId = evaluation?.leave_id ? String(evaluation.leave_id) : null;
    const leave = leaveId ? leaveById.get(leaveId) : null;
    const isPaidLeave = leaveId ? isLeavePaidByPolicy(leave) : false;

    if (leaveId) {
      if (isPaidLeave) {
        paidLeaveDays += payableFraction;
      }
      unpaidLeaveDays += round2(1 - payableFraction);
    } else {
      if (payableFraction >= 1) {
        presentDays += 1;
      } else if (payableFraction === 0.5) {
        halfDays += 1;
        halfDayUnits += 0.5;
      }
      unpaidLeaveDays += round2(1 - payableFraction);
    }
  }

  const overtimeHours = overtimeEvaluation.accepted_hours;
  const lateArrivals = Number(attendanceEvaluation.summary.late_arrivals || 0);
  const payableDays = round2(
    (attendanceEvaluation?.evaluations || []).reduce(
      (sum, row) => sum + Number(row?.payable_day_fraction || 0),
      0
    )
  );
  const derivedPayableFromCounters = round2(presentDays + halfDayUnits + paidLeaveDays);
  const payableMismatch = Math.abs(payableDays - derivedPayableFromCounters) > 0.01;
  const totalAccountedUnits = round2(derivedPayableFromCounters + unpaidLeaveDays);
  const dayUnitMismatch = Math.abs(totalAccountedUnits - Number(bounds.workingDays || 0)) > 0.01;
  if (payableMismatch) {
    console.warn("[payroll-alignment] payable day mismatch detected", {
      employee_id: employeeId,
      month,
      year,
      payable_from_evaluation: payableDays,
      payable_from_counters: derivedPayableFromCounters,
    });
  }
  if (dayUnitMismatch) {
    console.warn("[payroll-alignment] day-unit mismatch detected", {
      employee_id: employeeId,
      month,
      year,
      working_days: Number(bounds.workingDays || 0),
      accounted_day_units: totalAccountedUnits,
      payable_from_counters: derivedPayableFromCounters,
      unpaid_leave_days: round2(unpaidLeaveDays),
    });
  }

  // Track shift hours, working hours, and overtime hours
  const totalShiftHours = round2(
    Array.from(bounds.workingDates).reduce((sum, day) => {
      const shift = shiftByDate.get(day);
      return sum + (shift?.shift?.duration_hours ? Number(shift.shift.duration_hours) : 8);
    }, 0)
  );
  
  const totalWorkingHours = round2(
    (attendanceEvaluation?.evaluations || []).reduce(
      (sum, row) => sum + Number(row?.worked_hours || 0),
      0
    )
  );
  
  const totalUnapprovedOvertime = round2(overtimeApprovalSplit.summary.total_unapproved_overtime || 0);
  const totalApprovedOvertime = round2(overtimeApprovalSplit.summary.total_approved_overtime || 0);

  // Filter attendanceRows for this employee and working days, and include all records
  const filteredAttendanceRows = (attendanceRows || []).filter(r => r.employee_id === employeeId || !r.employee_id);
  const evaluatedSummaryForPayroll = {
    ...(attendanceEvaluation?.summary || {}),
    total_working_days: bounds.workingDays,
    present_days: round2(presentDays),
    half_days: round2(halfDays),
    half_day_units: round2(halfDayUnits),
    paid_leave_days: round2(paidLeaveDays),
    unpaid_leave_days: round2(unpaidLeaveDays),
    payable_days: round2(payableDays),
    late_arrivals: round2(lateArrivals),
  };
  
  // Build overtime rows for return (approved overtime rows + metadata about approvals)
  const overtimeRowsForReturn = approvedOvertimeRows.map(row => ({
    ...row,
    approval_status: 'approved'
  }));
  
  // Add unapproved overtime rows for tracking
  Array.from(overtimeApprovalSplit.unapproved_hours_by_date.entries()).forEach(([date, hours]) => {
    overtimeRowsForReturn.push({
      date,
      hours,
      approval_status: 'unapproved_added_to_working_hours'
    });
  });
  
  return {
    ...bounds,
    attendanceRows: filteredAttendanceRows,
    leaveRows: leaveRows || [],
    overtimeRows: overtimeRowsForReturn,
    attendanceSummary: {
      total_working_days: bounds.workingDays,
      non_working_days: (bounds.nonWorkingDates || []).length,
      non_working_dates: bounds.nonWorkingDates || [],
      present_days: round2(presentDays),
      half_days: round2(halfDays),
      half_day_units: round2(halfDayUnits),
      paid_leave_days: round2(paidLeaveDays),
      absent_days: round2(unpaidLeaveDays),
      payable_days: round2(payableDays),
      shift_tracking: {
        total_shift_hours: totalShiftHours,
        total_working_hours: totalWorkingHours,
        working_hours_breakdown: {
          from_attendance: round2(totalWorkingHours - totalUnapprovedOvertime),
          from_unapproved_overtime: totalUnapprovedOvertime,
        },
      },
      overtime_tracking: {
        potential_overtime: round2(overtimeApprovalSplit.summary.total_potential_overtime || 0),
        approved_overtime: totalApprovedOvertime,
        unapproved_overtime: totalUnapprovedOvertime,
        note: 'approved_overtime paid at overtime rate; unapproved_overtime added to working_hours as regular pay',
      },
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
      regularization_summary: {
        approved_regularizations_applied: Number(attendanceEvaluation?.summary?.approved_regularizations_applied || 0),
      },
      alignment_validation: {
        payable_from_attendance_evaluation: payableDays,
        payable_from_payroll_counters: derivedPayableFromCounters,
        mismatch_detected: payableMismatch,
        working_days: Number(bounds.workingDays || 0),
        accounted_day_units: totalAccountedUnits,
        day_unit_mismatch_detected: dayUnitMismatch,
      },
      late_evaluation: lateEvaluation,
      evaluated_attendance: {
        summary: evaluatedSummaryForPayroll,
        records: attendanceEvaluation.evaluations,
      },
      overtime_policy: overtimeEvaluation.policy,
      overtime_violations: overtimeEvaluation.violations,
      sandwich_policy: { disabled_in_payroll_layer: true, source_of_truth: "attendance_evaluation" },
      sandwich_days: [],
      sandwich_added_unpaid_days: 0,
    },
    leaveSummary: {
      paid_leave_days: round2(paidLeaveDays),
      unpaid_leave_days: round2(unpaidLeaveDays),
    },
  };
};
