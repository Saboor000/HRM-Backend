import { isBonusEligible } from "./payroll.bonus.js";
import { getPayrollRulesConfig } from "./payroll.rules.js";
import { getComponentAmount, getComponentTotal, normalizeNumeric, round2 } from "./payroll.utils.js";
import { isTaxComponent, resolveTaxDeduction } from "./payroll.tax.js";

export const calculatePayrollSnapshot = (employee, salaryStructure, period) => {
  const rules = getPayrollRulesConfig(salaryStructure);
  const audit = [];

  const ctx = {
    employee,
    salaryStructure,
    period,
    rules,
    basicSalaryFull: normalizeNumeric(salaryStructure.basic_salary),
    workingDays: Number(period.workingDays || 0),
    attendance: {
      present_days: round2(period.attendanceSummary.present_days),
      half_days: round2(period.attendanceSummary.half_days || 0),
      half_day_units: round2(period.attendanceSummary.half_day_units || 0),
      paid_leave_days: round2(period.leaveSummary.paid_leave_days),
      unpaid_leave_days: round2(period.leaveSummary.unpaid_leave_days),
      overtime_hours: round2(period.attendanceSummary.overtime_hours),
      unapproved_overtime_hours: round2(period.attendanceSummary.shift_tracking?.working_hours_breakdown?.from_unapproved_overtime || 0),
      late_arrivals: Number(period.attendanceSummary.late_arrivals || 0),
      late_arrivals_original: Number(period.attendanceSummary.late_arrivals || 0),
      late_penalty_days: 0,
    },
    payableDays: 0,
    prorateFactor: 0,
    prorateFactorPercent: 0,
    basicSalaryProrated: 0,
    allowanceItems: [],
    bonusItems: [],
    nonTaxDeductionItems: [],
    taxItem: null,
    allowancesTotal: 0,
    bonusesTotal: 0,
    overtimeAmount: 0,
    unapprovedOvertimeAsRegularPay: 0,
    grossSalary: 0,
    deductionsTotal: 0,
    netSalary: 0,
    lopAmount: 0,
    perDaySalary: 0,
    overtimeHourlyRate: 0,
    overtimeWorkHours: 0,
  };

  const recordAudit = (rule, details) => {
    audit.push({
      rule,
      details,
      applied_at: new Date().toISOString(),
    });
  };
  const getProratedFixedComponentAmount = (component) => {
    const shouldProrate = component.apply_proration !== false;
    return round2(Number(component.value || 0) * (shouldProrate ? ctx.prorateFactor : 1));
  };

  ctx.perDaySalary = ctx.workingDays > 0 ? round2(ctx.basicSalaryFull / ctx.workingDays) : 0;
  recordAudit("attendance_evaluation", {
    present_days: ctx.attendance.present_days,
    half_days: ctx.attendance.half_days,
    half_day_units: ctx.attendance.half_day_units,
    paid_leave_days: ctx.attendance.paid_leave_days,
    unpaid_leave_days: ctx.attendance.unpaid_leave_days,
    payable_days_from_attendance: round2(period.attendanceSummary.payable_days || 0),
    late_arrivals: ctx.attendance.late_arrivals,
  });

  // Keep payroll as a pure aggregation layer: no attendance-day transformations here.
  ctx.attendance.late_penalty_days = 0;
  // Ensure late arrival details are visible in payroll snapshot
  ctx.lateEvaluation = period.attendanceSummary.late_evaluation || {};

  recordAudit("late_penalty_conversion", {
    rule: "disabled_in_payroll_layer",
    computed_unpaid_days_from_late: 0,
    applied_unpaid_days_from_late: 0,
  });

  ctx.attendance.present_days = round2(Math.max(0, ctx.attendance.present_days));
  ctx.attendance.half_days = round2(Math.max(0, ctx.attendance.half_days || 0));
  ctx.attendance.half_day_units = round2(Math.max(0, ctx.attendance.half_day_units || 0));
  ctx.attendance.paid_leave_days = round2(Math.max(0, ctx.attendance.paid_leave_days));
  ctx.attendance.unpaid_leave_days = round2(Math.max(0, ctx.attendance.unpaid_leave_days));
  // Proration must always use attendance-evaluated payable days as source of truth.
  ctx.payableDays = round2(period.attendanceSummary.payable_days || 0);
  const payableRatio = ctx.workingDays > 0 ? ctx.payableDays / ctx.workingDays : 0;

  recordAudit("leave_adjustment", {
    payable_days: ctx.payableDays,
    present_days: ctx.attendance.present_days,
    paid_leave_days: ctx.attendance.paid_leave_days,
    unpaid_leave_days: ctx.attendance.unpaid_leave_days,
  });

  ctx.prorateFactor = rules.attendance.apply_proration_default ? payableRatio : 1;
  ctx.prorateFactorPercent = ctx.workingDays > 0 ? round2((ctx.payableDays / ctx.workingDays) * 100) : 0;
  ctx.basicSalaryProrated = round2(ctx.basicSalaryFull * ctx.prorateFactor);
  // Ensure per-day salary and all amounts are always calculated, even for a single present day
  if (ctx.payableDays > 0 && ctx.basicSalaryProrated === 0) {
    ctx.basicSalaryProrated = round2(ctx.perDaySalary * ctx.payableDays);
  }

  const proratedComponentAmount = (component, baseValues) => {
    if (!component) return 0;
    if (component.type === "fixed") {
      return getProratedFixedComponentAmount(component);
    }
    return getComponentAmount(component, baseValues);
  };

  recordAudit("salary_proration", {
    proration_factor_percent: ctx.prorateFactorPercent,
    basic_salary_full: ctx.basicSalaryFull,
    basic_salary_prorated: ctx.basicSalaryProrated,
  });

  ctx.allowanceItems = (salaryStructure.allowances || []).map((component) => ({
    ...component,
    amount: proratedComponentAmount(component, {
      basic_salary: ctx.basicSalaryProrated,
      gross_salary: ctx.basicSalaryProrated,
    }),
  }));
  ctx.allowancesTotal = round2(
    ctx.allowanceItems.reduce((sum, component) => sum + Number(component.amount || 0), 0)
  );

  // Build bonus item from bonus_policy (policy-driven, not array-based)
  ctx.bonusItems = [];
  if (rules.bonus && rules.bonus.bonus_rate_default !== undefined && rules.bonus.bonus_rate_default > 0) {
    const bonusPolicy = rules.bonus;
    const bonusComponent = {
      name: bonusPolicy.name || "Bonus",
      type: bonusPolicy.bonus_mode_default || "fixed",
      value: bonusPolicy.bonus_rate_default,
      basis: "basic_salary",
    };

    const eligibility = isBonusEligible(
      {
        eligibility: {
          min_present_days: bonusPolicy.min_present_days,
          min_payable_days: bonusPolicy.min_payable_days,
          min_payable_ratio: bonusPolicy.min_payable_ratio,
          max_unpaid_leave_days: bonusPolicy.max_unpaid_leave_days,
          require_full_attendance: bonusPolicy.require_full_attendance,
        },
      },
      {
        presentDays: ctx.attendance.present_days,
        payableDays: ctx.payableDays,
        half_days: ctx.attendance.half_days,
        half_day_units: ctx.attendance.half_day_units,
        payableRatio,
        unpaidLeaves: ctx.attendance.unpaid_leave_days,
      }
    );

    const bonusAmount = eligibility.eligible
      ? proratedComponentAmount(bonusComponent, {
          basic_salary: ctx.basicSalaryProrated,
          gross_salary: ctx.basicSalaryProrated + ctx.allowancesTotal,
        })
      : 0;

    ctx.bonusItems.push({
      ...bonusComponent,
      eligible: eligibility.eligible,
      ineligibility_reason: eligibility.reason,
      amount: bonusAmount,
    });
  }
  ctx.bonusesTotal = round2(ctx.bonusItems.reduce((sum, component) => sum + Number(component.amount || 0), 0));

  // Always use the overtime policy linked in the salary structure for calculations and snapshot
  ctx.overtimeWorkHours = round2(ctx.workingDays * Number(rules.overtime.standard_work_hours_per_day));
  ctx.overtimeHourlyRate = ctx.overtimeWorkHours > 0 ? round2(ctx.basicSalaryFull / ctx.overtimeWorkHours) : 0;
  const overtimeProrationFactor = rules.overtime.apply_proration_default ? payableRatio : 1;
  ctx.overtimeAmount = round2(
    ctx.overtimeHourlyRate * ctx.attendance.overtime_hours * Number(rules.overtime.multiplier) * overtimeProrationFactor
  );

  // Unapproved overtime is paid as regular working hours (no multiplier)
  ctx.unapprovedOvertimeAsRegularPay = round2(
    ctx.overtimeHourlyRate * ctx.attendance.unapproved_overtime_hours * overtimeProrationFactor
  );

  ctx.grossSalary = round2(
    ctx.basicSalaryProrated + ctx.allowancesTotal + ctx.bonusesTotal + ctx.overtimeAmount + ctx.unapprovedOvertimeAsRegularPay
  );

  recordAudit("earnings_calculation", {
    allowances_total: ctx.allowancesTotal,
    bonuses_total: ctx.bonusesTotal,
    overtime_amount: ctx.overtimeAmount,
    gross_salary: ctx.grossSalary,
  });

  const deductionComponentAmount = (component) => {
    if (!component) return 0;
    if (component.type === "fixed") {
      return getProratedFixedComponentAmount(component);
    }

    return getComponentAmount(component, {
      basic_salary: ctx.basicSalaryProrated,
      gross_salary: ctx.grossSalary,
    });
  };

  const nonTaxDeductions = (salaryStructure.deductions || []).filter((component) => !isTaxComponent(component));
  ctx.nonTaxDeductionItems = nonTaxDeductions.map((component) => {
    // Remove fixed late fine deduction if late-to-unpaid-day policy is active
    if (
      (component.code === 'late_fine' || component.name?.toLowerCase().includes('late')) &&
      Number(rules.attendance.late_count_for_unpaid_day || 0) > 1
    ) {
      // Policy is 'N late = 1 unpaid day', so do NOT apply fixed late fine
      return { ...component, amount: 0 };
    }
    return { ...component, amount: deductionComponentAmount(component) };
  });
  let nonTaxDeductionsTotal = round2(
    ctx.nonTaxDeductionItems.reduce((sum, component) => sum + Number(component.amount || 0), 0)
  );

  const explicitTaxComponent = (salaryStructure.deductions || []).find((component) => isTaxComponent(component));
  const { amount: taxAmount, taxItem } = resolveTaxDeduction({
    taxComponent: explicitTaxComponent,
    basicSalary: ctx.basicSalaryProrated,
    grossSalary: ctx.grossSalary,
    preferredMode: String(rules?.deductions?.tax_mode_default || "slab"),
    policyTaxMode: String(rules?.deductions?.tax_mode_default || "slab"),
    policyTaxRate: Number(rules?.deductions?.tax_rate_default || 0),
    policyTaxSlabs: rules?.deductions?.tax_slabs_default,
    taxApplyProration: Boolean(rules?.deductions?.tax_apply_proration_default),
    prorationFactor: payableRatio,
  });
  ctx.taxItem = taxItem;

  const maxNonTaxAllowed = round2(Math.max(0, ctx.grossSalary - taxAmount));
  let deductionCapped = false;
  let cappedAmount = 0;

  if (
    rules.deductions.cap_total_deductions_to_gross &&
    !rules.deductions.allow_negative_net_salary &&
    nonTaxDeductionsTotal > maxNonTaxAllowed
  ) {
    deductionCapped = true;
    cappedAmount = round2(nonTaxDeductionsTotal - maxNonTaxAllowed);

    let remainingOverflow = cappedAmount;
    for (let i = ctx.nonTaxDeductionItems.length - 1; i >= 0 && remainingOverflow > 0; i -= 1) {
      const current = Number(ctx.nonTaxDeductionItems[i].amount || 0);
      if (current <= 0) continue;
      const reduced = Math.max(0, round2(current - remainingOverflow));
      const used = round2(current - reduced);
      ctx.nonTaxDeductionItems[i].amount = reduced;
      remainingOverflow = round2(Math.max(0, remainingOverflow - used));
    }

    nonTaxDeductionsTotal = round2(
      ctx.nonTaxDeductionItems.reduce((sum, component) => sum + Number(component.amount || 0), 0)
    );
  }

  ctx.deductionsTotal = round2(nonTaxDeductionsTotal + taxAmount);

  const flatDeductionsReference = getComponentTotal(salaryStructure.deductions || [], {
    basic_salary: ctx.basicSalaryProrated,
    gross_salary: ctx.grossSalary,
  });

  recordAudit("rule_based_deductions", {
    non_tax_deductions_total: nonTaxDeductionsTotal,
    tax_mode: taxItem.mode,
    tax_amount: taxAmount,
    deductions_total: ctx.deductionsTotal,
    flat_deduction_reference: flatDeductionsReference,
  });

  ctx.netSalary = round2(ctx.grossSalary - ctx.deductionsTotal);

  if (!rules.deductions.allow_negative_net_salary && ctx.netSalary < 0) {
    const extraClamp = Math.abs(ctx.netSalary);
    ctx.deductionsTotal = round2(Math.max(0, ctx.deductionsTotal - extraClamp));
    ctx.netSalary = 0;
  }

  recordAudit("deduction_validation", {
    cap_total_deductions_to_gross: rules.deductions.cap_total_deductions_to_gross,
    allow_negative_net_salary: rules.deductions.allow_negative_net_salary,
    deduction_capped: deductionCapped,
    capped_amount: cappedAmount,
    deductions_after_validation: ctx.deductionsTotal,
  });

  recordAudit("final_net_salary", {
    gross_salary: ctx.grossSalary,
    deductions_total: ctx.deductionsTotal,
    net_salary: ctx.netSalary,
  });

  const earningsBreakdown = {
    basic_salary: ctx.basicSalaryProrated,
    allowances: ctx.allowanceItems,
    bonuses: ctx.bonusItems,
    overtime: {
      approved_hours: round2(ctx.attendance.overtime_hours),
      unapproved_hours: round2(ctx.attendance.unapproved_overtime_hours),
      hourly_rate: ctx.overtimeHourlyRate,
      standard_work_hours_per_day: Number(rules.overtime.standard_work_hours_per_day),
      total_working_hours: ctx.overtimeWorkHours,
      approved_rate_multiplier: Number(rules.overtime.multiplier),
      approved_overtime_amount: ctx.overtimeAmount,
      unapproved_overtime_amount: ctx.unapprovedOvertimeAsRegularPay,
      note: 'approved_overtime multiplied by rate_multiplier; unapproved_overtime paid at regular rate',
    },
  };

  const deductionsBreakdown = {
    items: [...ctx.nonTaxDeductionItems, ctx.taxItem],
    tax: {
      mode: ctx.taxItem.mode,
      taxable_income: ctx.grossSalary,
      slabs: ctx.taxItem.slabs || null,
      rate: ctx.taxItem.rate ?? null,
      applicable_rate: ctx.taxItem.applicable_rate ?? null,
      exemption_reason: ctx.taxItem.exemption_reason ?? null,
      amount: ctx.taxItem.amount,
      flat_deduction_reference: flatDeductionsReference,
      deduction_cap_policy: {
        cap_total_deductions_to_gross: rules.deductions.cap_total_deductions_to_gross,
        allow_negative_net_salary: rules.deductions.allow_negative_net_salary,
      },
    },
    lop: {
      applied: false,
      unpaid_leave_days: null,
      per_day_salary: null,
      daily_rate_prorated: null,
      amount: 0,
      notes: "LOP module disabled: salary is computed via payable-day proration",
    },
  };

  return {
    employee,
    salary_structure: salaryStructure,
    payroll_rules_snapshot: rules,
    payroll_rule_audit: audit,
    period: {
      month: period.month,
      year: period.year,
      start_date: period.startDate,
      end_date: period.endDate,
      working_days: period.workingDays,
      non_working_days: (period.nonWorkingDates || []).length,
      non_working_dates: period.nonWorkingDates || [],
    },
    summary: {
      total_days: period.workingDays,
      present_days: round2(ctx.attendance.present_days),
      paid_leaves: round2(ctx.attendance.paid_leave_days),
      unpaid_leaves: round2(ctx.attendance.unpaid_leave_days),
      payable_days: round2(ctx.payableDays),
      proration_factor_percent: round2(ctx.prorateFactorPercent),
      overtime_tracking: {
        approved_overtime_hours: round2(ctx.attendance.overtime_hours),
        unapproved_overtime_hours: round2(ctx.attendance.unapproved_overtime_hours),
        note: 'approved_overtime paid at overtime multiplier rate; unapproved_overtime paid at regular hourly rate',
      },
      late_arrivals: Number(ctx.attendance.late_arrivals || 0),
      late_penalty_days: Number(ctx.attendance.late_penalty_days || 0),
      late_penalty_rule: {
        late_count_for_unpaid_day: Number(period.attendanceSummary?.late_penalty_rule?.late_count_for_unpaid_day || 0),
        computed_unpaid_days_from_late: Number(period.attendanceSummary?.late_penalty_rule?.computed_unpaid_days_from_late || 0),
        applied_unpaid_days_from_late: Number(period.attendanceSummary?.late_penalty_rule?.applied_unpaid_days_from_late || 0),
      },
      absent_days: round2(ctx.attendance.unpaid_leave_days),
      leave_module_summary: period.leaveModuleSummary || null,
      overtime_module_summary: period.overtimeModuleSummary || null,
    },
    totals: {
      full_month_basic_salary: ctx.basicSalaryFull,
      basic_salary: ctx.basicSalaryProrated,
      allowances_total: ctx.allowancesTotal,
      bonuses_total: ctx.bonusesTotal,
      overtime_amount: ctx.overtimeAmount,
      gross_salary: ctx.grossSalary,
      per_day_salary: ctx.perDaySalary,
      lop_amount: 0,
      lop_deduction: 0,
      deductions_total: ctx.deductionsTotal,
      net_salary: ctx.netSalary,
    },
    earningsBreakdown,
    deductionsBreakdown,
    attendanceSnapshot: {
      summary: {
        ...period.attendanceSummary,
        present_days: round2(ctx.attendance.present_days),
        half_days: round2(ctx.attendance.half_days),
        half_day_units: round2(ctx.attendance.half_day_units),
        absent_days: round2(ctx.attendance.unpaid_leave_days),
        late_arrivals: Number(ctx.attendance.late_arrivals || 0),
        late_penalty_days: Number(ctx.attendance.late_penalty_days || 0),
        late_penalty_rule: {
          late_count_for_unpaid_day: Number(period.attendanceSummary?.late_penalty_rule?.late_count_for_unpaid_day || 0),
          computed_unpaid_days_from_late: Number(period.attendanceSummary?.late_penalty_rule?.computed_unpaid_days_from_late || 0),
          applied_unpaid_days_from_late: Number(period.attendanceSummary?.late_penalty_rule?.applied_unpaid_days_from_late || 0),
        },
        leave_module_summary: period.leaveModuleSummary || null,
        overtime_module_summary: period.overtimeModuleSummary || null,
      },
      // Always use DB status for each record
      records: (period.attendanceRows || []).map(r => ({ ...r, status: r.status })),
    },
    leaveSnapshot: {
      summary: {
        paid_leave_days: round2(ctx.attendance.paid_leave_days),
        unpaid_leave_days: round2(ctx.attendance.unpaid_leave_days),
        module_summary: period.leaveModuleSummary || null,
      },
      records: period.leaveRows,
    },
    overtimeSnapshot: {
      summary: {
        module_summary: period.overtimeModuleSummary || null,
      },
      records: period.overtimeRows || [],
    },
    moduleSummary: {
      leave: period.leaveModuleSummary || null,
      overtime: period.overtimeModuleSummary || null,
    },
    salaryStructureSnapshot: salaryStructure,
  };
};
