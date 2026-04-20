import {
  DEFAULT_OVERTIME_RATE_MULTIPLIER,
  DEFAULT_POLICY_TIMEZONE,
  DEFAULT_WORK_HOURS_PER_DAY,
  LATE_ARRIVAL_PENALTY_STEP,
} from "./payroll.utils.js";

const firstTruthy = (...values) => values.find((value) => Boolean(value));
const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

const parseMaybeJson = (value) => {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeListValue = (value) => {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return parsed;
  if (typeof parsed === "string") {
    return parsed.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
};

const normalizeObjectValue = (value) => {
  const parsed = parseMaybeJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const normalizeArrayValue = (value) => {
  const parsed = parseMaybeJson(value);
  return Array.isArray(parsed) ? parsed : [];
};

const LINKED_POLICY_BY_SECTION = {
  attendance: "attendance_policy",
  overtime: "overtime_policy",
  leave: "leave_policy",
  deductions: "tax_policy",
  bonuses: "bonus_policy",
};

const getPolicySources = (salaryStructure, section) => ({
  base: salaryStructure?.payroll_rules?.[section],
  allowances: (salaryStructure?.allowances || []).find((c) => c?.policy?.[section])?.policy?.[section],
  deductions: (salaryStructure?.deductions || []).find((c) => c?.policy?.[section])?.policy?.[section],
  bonuses: (salaryStructure?.bonuses || []).find((c) => c?.policy?.[section])?.policy?.[section],
  linked: salaryStructure?.[LINKED_POLICY_BY_SECTION[section] || `${section}_policy`],
});

export const getPayrollRulesConfig = (salaryStructure = {}) => {
  const attendance = getPolicySources(salaryStructure, "attendance");
  const overtime = getPolicySources(salaryStructure, "overtime");
  const leave = getPolicySources(salaryStructure, "leave");
  const deductions = getPolicySources(salaryStructure, "deductions");
  const bonus = getPolicySources(salaryStructure, "bonuses");

  const attendanceBase = attendance.base || {};
  const attendanceAllowances = attendance.allowances || {};
  const attendanceDeductions = attendance.deductions || {};
  const attendanceBonuses = attendance.bonuses || {};

  return {
    ...(salaryStructure?.payroll_rules || {}),
    attendance: {
      ...attendanceBase,
      ...attendanceAllowances,
      ...attendanceDeductions,
      ...attendanceBonuses,
      ...(attendance.linked || {}),
      late_count_for_unpaid_day: Number(
        firstTruthy(
          attendance.linked?.late_count_for_unpaid_day,
          attendanceBase?.late_count_for_unpaid_day,
          attendanceAllowances?.late_count_for_unpaid_day,
          attendanceDeductions?.late_count_for_unpaid_day,
          attendanceBonuses?.late_count_for_unpaid_day,
          LATE_ARRIVAL_PENALTY_STEP
        )
      ),
      grace_minutes_default: Number(
        firstTruthy(
          attendance.linked?.grace_minutes_default,
          attendanceBase?.grace_minutes_default,
          attendanceAllowances?.grace_minutes_default,
          attendanceDeductions?.grace_minutes_default,
          attendanceBonuses?.grace_minutes_default,
          0
        )
      ),
      shift_grace_by_shift_id:
        firstTruthy(
          normalizeObjectValue(attendance.linked?.shift_grace_by_shift_id),
          normalizeObjectValue(attendanceBase?.shift_grace_by_shift_id),
          normalizeObjectValue(attendanceAllowances?.shift_grace_by_shift_id),
          normalizeObjectValue(attendanceDeductions?.shift_grace_by_shift_id),
          normalizeObjectValue(attendanceBonuses?.shift_grace_by_shift_id)
        ) || {},
      shift_grace_by_shift_name:
        firstTruthy(
          normalizeObjectValue(attendance.linked?.shift_grace_by_shift_name),
          normalizeObjectValue(attendanceBase?.shift_grace_by_shift_name),
          normalizeObjectValue(attendanceAllowances?.shift_grace_by_shift_name),
          normalizeObjectValue(attendanceDeductions?.shift_grace_by_shift_name),
          normalizeObjectValue(attendanceBonuses?.shift_grace_by_shift_name)
        ) || {},
      weekly_off_days:
        normalizeListValue(
          firstTruthy(
            attendance.linked?.weekly_off_days,
            attendanceBase?.weekly_off_days,
            attendanceAllowances?.weekly_off_days,
            attendanceDeductions?.weekly_off_days,
            attendanceBonuses?.weekly_off_days
          )
        ),
      working_weekend_dates:
        normalizeListValue(
          firstTruthy(
            attendance.linked?.working_weekend_dates,
            attendanceBase?.working_weekend_dates,
            attendanceAllowances?.working_weekend_dates,
            attendanceDeductions?.working_weekend_dates,
            attendanceBonuses?.working_weekend_dates
          )
        ),
      holiday_dates:
        normalizeListValue(
          firstTruthy(
            attendance.linked?.holiday_dates,
            attendanceBase?.holiday_dates,
            attendanceAllowances?.holiday_dates,
            attendanceDeductions?.holiday_dates,
            attendanceBonuses?.holiday_dates
          )
        ),
      forced_working_dates:
        normalizeListValue(
          firstTruthy(
            attendance.linked?.forced_working_dates,
            attendanceBase?.forced_working_dates,
            attendanceAllowances?.forced_working_dates,
            attendanceDeductions?.forced_working_dates,
            attendanceBonuses?.forced_working_dates
          )
        ),
      manual_off_dates:
        normalizeListValue(
          firstTruthy(
            attendance.linked?.manual_off_dates,
            attendanceBase?.manual_off_dates,
            attendanceAllowances?.manual_off_dates,
            attendanceDeductions?.manual_off_dates,
            attendanceBonuses?.manual_off_dates
          )
        ),
      timezone:
        firstTruthy(
          attendance.linked?.timezone,
          attendanceBase?.timezone,
          attendanceAllowances?.timezone,
          attendanceDeductions?.timezone,
          attendanceBonuses?.timezone
        ) || DEFAULT_POLICY_TIMEZONE,
      apply_proration_default: Boolean(
        firstDefined(
          attendance.linked?.apply_proration_default,
          attendanceBase?.apply_proration_default,
          attendanceAllowances?.apply_proration_default,
          attendanceDeductions?.apply_proration_default,
          attendanceBonuses?.apply_proration_default,
          true
        )
      ),
    },
    overtime: {
      ...(overtime.base || {}),
      ...(overtime.allowances || {}),
      ...(overtime.deductions || {}),
      ...(overtime.bonuses || {}),
      ...(overtime.linked || {}),
      standard_work_hours_per_day: Number(
        firstTruthy(
          overtime.linked?.standard_work_hours_per_day,
          salaryStructure.standard_work_hours_per_day,
          DEFAULT_WORK_HOURS_PER_DAY
        )
      ),
      multiplier: Number(
        firstTruthy(
          overtime.linked?.multiplier,
          salaryStructure.overtime_multiplier,
          DEFAULT_OVERTIME_RATE_MULTIPLIER
        )
      ),
      min_hours_per_day: Number(
        firstTruthy(
          overtime.linked?.min_hours_per_day,
          overtime.base?.min_hours_per_day,
          overtime.allowances?.min_hours_per_day,
          overtime.deductions?.min_hours_per_day,
          overtime.bonuses?.min_hours_per_day,
          2
        )
      ),
      max_hours_per_day: Number(
        firstTruthy(
          overtime.linked?.max_hours_per_day,
          overtime.base?.max_hours_per_day,
          overtime.allowances?.max_hours_per_day,
          overtime.deductions?.max_hours_per_day,
          overtime.bonuses?.max_hours_per_day,
          4
        )
      ),
      max_hours_per_month: Number(
        firstTruthy(
          overtime.linked?.max_hours_per_month,
          overtime.base?.max_hours_per_month,
          overtime.allowances?.max_hours_per_month,
          overtime.deductions?.max_hours_per_month,
          overtime.bonuses?.max_hours_per_month,
          20
        )
      ),
      apply_proration_default: Boolean(
        firstDefined(
          overtime.linked?.apply_proration_default,
          overtime.base?.apply_proration_default,
          overtime.allowances?.apply_proration_default,
          overtime.deductions?.apply_proration_default,
          overtime.bonuses?.apply_proration_default,
          false
        )
      ),
    },
    leave: {
      ...(leave.base || {}),
      ...(leave.allowances || {}),
      ...(leave.deductions || {}),
      ...(leave.bonuses || {}),
      sandwich_enabled: Boolean(
        firstTruthy(
          leave.base?.sandwich_enabled,
          leave.allowances?.sandwich_enabled,
          leave.deductions?.sandwich_enabled,
          leave.bonuses?.sandwich_enabled,
          false
        )
      ),
      half_day_unit: Number(
        firstTruthy(
          leave.base?.half_day_unit,
          leave.allowances?.half_day_unit,
          leave.deductions?.half_day_unit,
          leave.bonuses?.half_day_unit,
          0.5
        )
      ),
      short_leave_hours_per_day: Number(
        firstTruthy(
          leave.base?.short_leave_hours_per_day,
          leave.allowances?.short_leave_hours_per_day,
          leave.deductions?.short_leave_hours_per_day,
          leave.bonuses?.short_leave_hours_per_day,
          8
        )
      ),
    },
    deductions: {
      ...(deductions.base || {}),
      ...(deductions.allowances || {}),
      ...(deductions.deductions || {}),
      ...(deductions.bonuses || {}),
      tax_mode_default:
        firstTruthy(
          deductions.linked?.tax_mode_default,
          deductions.base?.tax_mode_default,
          deductions.allowances?.tax_mode_default,
          deductions.deductions?.tax_mode_default,
          deductions.bonuses?.tax_mode_default
        ) || "slab",
      tax_slabs_default:
        normalizeArrayValue(
          firstDefined(
            deductions.linked?.tax_slabs,
            deductions.base?.tax_slabs,
            deductions.allowances?.tax_slabs,
            deductions.deductions?.tax_slabs,
            deductions.bonuses?.tax_slabs,
            []
          )
        ),
      tax_rate_default: Number(
        firstDefined(
          deductions.linked?.tax_rate_default,
          deductions.base?.tax_rate_default,
          deductions.allowances?.tax_rate_default,
          deductions.deductions?.tax_rate_default,
          deductions.bonuses?.tax_rate_default,
          0
        )
      ),
      tax_apply_proration_default: Boolean(
        firstDefined(
          deductions.linked?.apply_proration_default,
          deductions.base?.apply_proration_default,
          deductions.allowances?.apply_proration_default,
          deductions.deductions?.apply_proration_default,
          deductions.bonuses?.apply_proration_default,
          false
        )
      ),
      cap_total_deductions_to_gross: Boolean(
        firstDefined(
          deductions.base?.cap_total_deductions_to_gross,
          deductions.allowances?.cap_total_deductions_to_gross,
          deductions.deductions?.cap_total_deductions_to_gross,
          deductions.bonuses?.cap_total_deductions_to_gross,
          true
        )
      ),
      allow_negative_net_salary: Boolean(
        firstDefined(
          deductions.base?.allow_negative_net_salary,
          deductions.allowances?.allow_negative_net_salary,
          deductions.deductions?.allow_negative_net_salary,
          deductions.bonuses?.allow_negative_net_salary,
          false
        )
      ),
    },
    bonus: {
      ...(bonus.base || {}),
      ...(bonus.allowances || {}),
      ...(bonus.deductions || {}),
      ...(bonus.bonuses || {}),
      ...(bonus.linked || {}),
      name: firstTruthy(bonus.linked?.name, bonus.base?.name, "Bonus"),
      bonus_mode_default:
        firstTruthy(
          bonus.linked?.bonus_mode_default,
          bonus.base?.bonus_mode_default,
          bonus.allowances?.bonus_mode_default,
          bonus.deductions?.bonus_mode_default,
          bonus.bonuses?.bonus_mode_default
        ) || "fixed",
      bonus_rate_default: Number(
        firstDefined(
          bonus.linked?.bonus_rate_default,
          bonus.base?.bonus_rate_default,
          bonus.allowances?.bonus_rate_default,
          bonus.deductions?.bonus_rate_default,
          bonus.bonuses?.bonus_rate_default,
          0
        )
      ),
      apply_proration_default: Boolean(
        firstDefined(
          bonus.linked?.apply_proration_default,
          bonus.base?.apply_proration_default,
          bonus.allowances?.apply_proration_default,
          bonus.deductions?.apply_proration_default,
          bonus.bonuses?.apply_proration_default,
          true
        )
      ),
      min_present_days: Number(
        firstDefined(
          bonus.linked?.min_present_days,
          bonus.base?.min_present_days,
          bonus.allowances?.min_present_days,
          bonus.deductions?.min_present_days,
          bonus.bonuses?.min_present_days,
          undefined
        )
      ) || undefined,
      min_payable_days: Number(
        firstDefined(
          bonus.linked?.min_payable_days,
          bonus.base?.min_payable_days,
          bonus.allowances?.min_payable_days,
          bonus.deductions?.min_payable_days,
          bonus.bonuses?.min_payable_days,
          undefined
        )
      ) || undefined,
      min_payable_ratio: Number(
        firstDefined(
          bonus.linked?.min_payable_ratio,
          bonus.base?.min_payable_ratio,
          bonus.allowances?.min_payable_ratio,
          bonus.deductions?.min_payable_ratio,
          bonus.bonuses?.min_payable_ratio,
          undefined
        )
      ) || undefined,
      max_unpaid_leave_days: Number(
        firstDefined(
          bonus.linked?.max_unpaid_leave_days,
          bonus.base?.max_unpaid_leave_days,
          bonus.allowances?.max_unpaid_leave_days,
          bonus.deductions?.max_unpaid_leave_days,
          bonus.bonuses?.max_unpaid_leave_days,
          undefined
        )
      ) || undefined,
      require_full_attendance: Boolean(
        firstDefined(
          bonus.linked?.require_full_attendance,
          bonus.base?.require_full_attendance,
          bonus.allowances?.require_full_attendance,
          bonus.deductions?.require_full_attendance,
          bonus.bonuses?.require_full_attendance,
          false
        )
      ),
    },
  };
};
