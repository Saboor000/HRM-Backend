import { calculatePayrollSnapshot } from "./payroll.calculator.js";
import { getPayrollPeriodSnapshot } from "./payroll.attendance.js";
import {
  fetchPayrollById,
  deletePayrollById,
  deletePayslipByPayrollId,
  findExistingPayroll,
  findPayslipByPayrollId,
  findSalaryStructureByEmployee,
  findSalaryStructureById,
  getEmployee,
  getEmployeesByIds,
  getSalaryStructure,
  insertSalaryStructure,
  listActiveSalaryStructureEmployeeIds,
  listPayrollByEmployee,
  listSalaryStructures,
  persistPayrollRow,
  updatePayrollStatus,
  updateSalaryStructureById,
  upsertPayslip,
} from "./payroll.repository.js";
import {
  getAttendancePolicyById,
  getOvertimePolicyById,
  getTaxPolicyById,
  getBonusPolicyById
} from "../policy.service.js";
import { getPayrollRulesConfig } from "./payroll.rules.js";
import { error, normalizeNumeric, round2, toDateOnly } from "./payroll.utils.js";

const isTaxLikeDeduction = (component = {}) => {
  const name = String(component?.name || "").toLowerCase();
  return name.includes("tax") || component?.tax_mode === "slab" || Array.isArray(component?.tax_slabs);
};

const validateTaxPolicyForPayroll = (policy) => {
  if (!policy) throw error(400, "Tax policy is required");

  const mode = String(policy.tax_mode_default || "").toLowerCase();
  if (!mode) throw error(400, "Tax policy mode is required");

  if (mode === "slab") {
    if (!Array.isArray(policy.tax_slabs) || policy.tax_slabs.length === 0) {
      throw error(400, "Tax policy slabs are required when tax mode is slab");
    }
    return;
  }

  if (mode === "percentage" || mode === "fixed") {
    const rate = Number(policy.tax_rate_default);
    if (!Number.isFinite(rate) || rate < 0) {
      throw error(400, "Tax policy rate is required when tax mode is percentage or fixed");
    }
  }
};

const validateBonusPolicyForPayroll = (policy) => {
  if (!policy) throw error(400, "Bonus policy is required");

  const mode = String(policy.bonus_mode_default || "").toLowerCase();
  if (!mode) throw error(400, "Bonus policy mode is required");

  if (mode === "percentage" || mode === "fixed") {
    const rate = Number(policy.bonus_rate_default);
    if (!Number.isFinite(rate) || rate < 0) {
      throw error(400, "Bonus policy rate is required when bonus mode is percentage or fixed");
    }
  }
};

const checkPolicyComponentType = (policy, modeKey, components, label) => {
  if (!policy) return;
  const mode = policy[modeKey] || (label === "tax" ? "slab" : null);
  const item = (components || []).find((entry) => String(entry.name || "").toLowerCase().includes(label));
  if (!item || !mode) return;

  if (
    (mode === "fixed" && item.type !== "fixed") ||
    (mode === "percentage" && item.type !== "percentage") ||
    (mode === "slab" && item.type !== "percentage")
  ) {
    throw error(400, `${label.charAt(0).toUpperCase() + label.slice(1)} type must be '${mode}' to match policy mode.`);
  }
};

const normalizeComponent = (
  component = {},
  fallbackName = "component",
  fallbackBasis = "basic_salary",
  defaultApplyProration = true
) => {
  if (typeof component === "number") {
    return {
      name: fallbackName,
      type: "fixed",
      value: round2(component),
      basis: fallbackBasis,
    };
  }

  let type = component.type === "percentage" ? "percentage" : "fixed";
  let value = normalizeNumeric(component.value ?? component.amount ?? 0);
  // Bonus validation: if type is percentage, value must be <= 100
    if (component.name && component.name.toLowerCase().includes("bonus") && type === "percentage" && value > 100) {
      // If percentage is > 100, force to fixed and set value as is
      type = "fixed";
  }
  const basis = component.basis === "gross_salary" ? "gross_salary" : fallbackBasis;

  return {
    name: component.name || fallbackName,
    type,
    value,
    basis,
    notes: component.notes || null,
    apply_proration:
      component.apply_proration === undefined
        ? defaultApplyProration
        : component.apply_proration !== false,
    is_bonus_eligible: component.is_bonus_eligible,
    eligibility: component.eligibility && typeof component.eligibility === "object" ? component.eligibility : null,
    tax_mode: component.tax_mode || null,
    tax_slabs: Array.isArray(component.tax_slabs) ? component.tax_slabs : null,
    policy: component.policy && typeof component.policy === "object" ? component.policy : null,
  };
};

const normalizeComponentList = (components, fallbackName, fallbackBasis, defaultApplyProration = true) => {
  if (!components) return [];

  if (Array.isArray(components)) {
    return components.map((component, index) =>
      normalizeComponent(component, `${fallbackName} ${index + 1}`, fallbackBasis, defaultApplyProration)
    );
  }

  if (typeof components === "object") {
    return Object.entries(components).map(([name, component]) =>
      normalizeComponent(
        typeof component === "object" ? { name, ...component } : { name, value: component },
        name,
        fallbackBasis,
        defaultApplyProration
      )
    );
  }

  if (typeof components === "number") {
    return [normalizeComponent(components, fallbackName, fallbackBasis, defaultApplyProration)];
  }

  return [];
};

const normalizeSalaryStructurePayload = (payload) => {
  if (Object.prototype.hasOwnProperty.call(payload, "bonuses")) {
    throw error(400, "bonuses array is not allowed in salary structure payload. Use bonus_policy_id instead.");
  }

  const basicSalary = normalizeNumeric(payload.basic_salary ?? payload.basic ?? 0);
  const allowances = Array.isArray(payload.allowances)
    ? normalizeComponentList(payload.allowances, "Allowance", "basic_salary", false)
    : normalizeComponentList(payload.allowances ?? payload.allowance_total ?? 0, "Allowance", "basic_salary", false);

  const deductions = Array.isArray(payload.deductions)
    ? normalizeComponentList(payload.deductions, "Deduction", "gross_salary")
    : normalizeComponentList(payload.deductions ?? payload.deduction_total ?? 0, "Deduction", "gross_salary");

  const bonuses = [];

  const nonTaxDeductions = deductions.filter((component) => !isTaxLikeDeduction(component));

  return {
    name: payload.name,
    currency: payload.currency,
    employee_id: payload.employee_id,
    basic_salary: basicSalary,
    basic_salary_type: payload.basic_salary_type || payload.basic_type || "fixed",
    basic_salary_basis: payload.basic_salary_basis || "basic_salary",
    allowances,
    deductions: nonTaxDeductions,
    bonuses,
    effective_from: payload.effective_from || toDateOnly(new Date()),
    is_active: payload.is_active ?? true,
    attendance_policy_id: payload.attendance_policy_id,
    overtime_policy_id: payload.overtime_policy_id,
    tax_policy_id: payload.tax_policy_id,
    bonus_policy_id: payload.bonus_policy_id,
  };
};

const toLegacySalaryResponse = (structure) => ({
  ...structure,
  basic: structure.basic_salary,
  allowance_total: (structure.allowances || []).reduce(
    (sum, component) => sum + Number(component.amount ?? component.value ?? 0),
    0
  ),
  deduction_total: (structure.deductions || []).reduce(
    (sum, component) => sum + Number(component.amount ?? component.value ?? 0),
    0
  ),
  bonus_total: (structure.bonuses || []).reduce(
    (sum, component) => sum + Number(component.amount ?? component.value ?? 0),
    0
  ),
});

const attachEmployee = async (record) => ({
  ...record,
  employee: await getEmployee(record.employee_id),
});

const toSalaryStructureResponse = async (salaryStructure) => ({
  ...toLegacySalaryResponse(salaryStructure),
  employee: await getEmployee(salaryStructure.employee_id),
  attendance_policy: salaryStructure.attendance_policy,
  overtime_policy: salaryStructure.overtime_policy,
  tax_policy: salaryStructure.tax_policy,
  bonus_policy: salaryStructure.bonus_policy,
});

const attachLinkedPolicies = async (salaryStructure, options = {}) => {
  const { injectPolicyBonus = false } = options;
  const [attendance_policy, overtime_policy, tax_policy, bonus_policy] = await Promise.all([
    salaryStructure.attendance_policy_id ? getAttendancePolicyById(salaryStructure.attendance_policy_id) : null,
    salaryStructure.overtime_policy_id ? getOvertimePolicyById(salaryStructure.overtime_policy_id) : null,
    salaryStructure.tax_policy_id ? getTaxPolicyById(salaryStructure.tax_policy_id) : null,
    salaryStructure.bonus_policy_id ? getBonusPolicyById(salaryStructure.bonus_policy_id) : null,
  ]);

  const bonusEligibility = bonus_policy
    ? {
        min_present_days: bonus_policy.min_present_days,
        min_payable_days: bonus_policy.min_payable_days,
        min_payable_ratio: bonus_policy.min_payable_ratio,
        max_unpaid_leave_days: bonus_policy.max_unpaid_leave_days,
        require_full_attendance: bonus_policy.require_full_attendance,
      }
    : null;

  const bonuses = (salaryStructure.bonuses || []).map((component) => ({ ...component }));

  if (
    injectPolicyBonus &&
    !bonuses.length &&
    bonus_policy?.bonus_rate_default !== undefined &&
    bonus_policy?.bonus_rate_default !== null
  ) {
    bonuses.push({
      name: "Policy Bonus",
      type: bonus_policy?.bonus_mode_default || "fixed",
      basis: "gross_salary",
      value: Number(bonus_policy.bonus_rate_default),
      notes: null,
      apply_proration: Boolean(bonus_policy?.apply_proration_default ?? true),
      eligibility: bonusEligibility || null,
      policy: null,
      tax_mode: null,
      tax_slabs: null,
    });
  }

  return {
    ...salaryStructure,
    bonuses,
    attendance_policy,
    overtime_policy,
    tax_policy,
    bonus_policy,
  };
};

const buildPayrollRow = (snapshot) => {
  const evaluated =
    snapshot?.attendanceSnapshot?.summary?.evaluated_attendance?.summary ||
    snapshot?.summary?.evaluated_attendance?.summary ||
    {};
  return {
    employee_id: snapshot.employee.id,
    salary_structure_id: snapshot.salary_structure.id,
    month: snapshot.period.month,
    year: snapshot.period.year,
    total_days: snapshot.summary.total_days,
    present_days: evaluated.present_days ?? snapshot.summary.present_days,
    half_days: evaluated.half_days ?? 0,
    half_day_units: evaluated.half_day_units ?? (evaluated.half_days ? evaluated.half_days * 0.5 : 0),
    late_arrivals: evaluated.late_arrivals ?? snapshot.summary?.late_arrivals ?? 0,
    paid_leaves: snapshot.summary.paid_leaves,
    unpaid_leaves: snapshot.summary.unpaid_leaves,
    payable_days: evaluated.payable_days ?? snapshot.summary.payable_days,
    overtime_hours: snapshot.summary.overtime_hours ?? snapshot.summary.overtime_hours,
    basic_salary: snapshot.totals.basic_salary,
    allowances_total: snapshot.totals.allowances_total,
    bonuses_total: snapshot.totals.bonuses_total,
    overtime_amount: snapshot.totals.overtime_amount,
    gross_salary: snapshot.totals.gross_salary,
    lop_amount: snapshot.totals.lop_amount ?? snapshot.totals.lop_deduction ?? 0,
    deductions_total: snapshot.totals.deductions_total,
    net_salary: snapshot.totals.net_salary,
    status: "draft",
    salary_structure_snapshot: snapshot.salaryStructureSnapshot,
    attendance_snapshot: snapshot.attendanceSnapshot,
    leave_snapshot: snapshot.leaveSnapshot,
    earnings_breakdown: snapshot.earningsBreakdown,
    deductions_breakdown: snapshot.deductionsBreakdown,
    summary_snapshot: snapshot.summary,
    period_snapshot: snapshot.period,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
};

const generatePayrollForEmployee = async (employeeId, month, year) => {
  const existing = await findExistingPayroll(employeeId, month, year);
  if (existing) {
    await upsertPayslip(existing, {
      payroll_id: existing.id,
      period: { month, year },
      totals: {
        basic_salary: existing.basic_salary,
        allowances_total: existing.allowances_total,
        bonuses_total: existing.bonuses_total,
        overtime_amount: existing.overtime_amount,
        gross_salary: existing.gross_salary,
        lop_amount: existing.lop_amount,
        deductions_total: existing.deductions_total,
        net_salary: existing.net_salary,
      },
      summary: existing.summary_snapshot,
      attendanceSnapshot: existing.attendance_snapshot,
      leaveSnapshot: existing.leave_snapshot,
      earningsBreakdown: existing.earnings_breakdown,
      deductionsBreakdown: existing.deductions_breakdown,
      salaryStructureSnapshot: existing.salary_structure_snapshot,
    });

    return attachEmployee(existing);
  }

  const employee = await getEmployee(employeeId);
  const salaryStructure = await attachLinkedPolicies(await getSalaryStructure(employeeId), {
    injectPolicyBonus: true,
  });
  const rules = getPayrollRulesConfig(salaryStructure);
  const period = await getPayrollPeriodSnapshot(employeeId, month, year, rules);
  period.month = month;
  period.year = year;

  const snapshot = calculatePayrollSnapshot(employee, salaryStructure, period);
  const payroll = await persistPayrollRow(buildPayrollRow(snapshot));
  await upsertPayslip(payroll, snapshot);
  return attachEmployee(payroll);
};

export const createSalaryStructureService = async (payload) => {
  try {
    await getEmployee(payload.employee_id);

    try {
      await findSalaryStructureByEmployee(payload.employee_id);
      throw error(409, "Salary structure already exists for employee");
    } catch (e) {
      if (e.status && e.status !== 404) throw e;
    }

    if (payload.tax_policy_id) {
      const taxPolicy = await getTaxPolicyById(payload.tax_policy_id);
      validateTaxPolicyForPayroll(taxPolicy);
    }
    if (payload.bonus_policy_id) {
      const bonusPolicy = await getBonusPolicyById(payload.bonus_policy_id);
      validateBonusPolicyForPayroll(bonusPolicy);
      checkPolicyComponentType(bonusPolicy, "bonus_mode_default", payload.bonuses, "bonus");
    }

    const data = await insertSalaryStructure(normalizeSalaryStructurePayload(payload));
    return toSalaryStructureResponse(await attachLinkedPolicies(data));
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getSalaryStructuresService = async (query = {}) => {
  try {
    const { data, count, page, limit } = await listSalaryStructures(query);
    const employeeMap = await getEmployeesByIds((data || []).map((row) => row.employee_id));

    return {
      salary_structures: (data || []).map((row) => ({
        ...toLegacySalaryResponse(row),
        employee: employeeMap.get(row.employee_id) || null,
      })),
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getSalaryStructureByIdService = async (id) => {
  try {
    return toSalaryStructureResponse(await attachLinkedPolicies(await findSalaryStructureById(id)));
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getSalaryStructureByEmployeeService = async (employeeId) => {
  try {
    return toSalaryStructureResponse(await attachLinkedPolicies(await findSalaryStructureByEmployee(employeeId)));
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const updateSalaryStructureService = async (id, payload) => {
  try {
    const existingStructure = await findSalaryStructureById(id);

    const effectiveTaxPolicyId = payload.tax_policy_id || existingStructure.tax_policy_id;
    if (effectiveTaxPolicyId) {
      const taxPolicy = await getTaxPolicyById(effectiveTaxPolicyId);
      validateTaxPolicyForPayroll(taxPolicy);
    }
    const effectiveBonusPolicyId = payload.bonus_policy_id || existingStructure.bonus_policy_id;
    if (effectiveBonusPolicyId) {
      const bonusPolicy = await getBonusPolicyById(effectiveBonusPolicyId);
      validateBonusPolicyForPayroll(bonusPolicy);
      checkPolicyComponentType(bonusPolicy, "bonus_mode_default", payload.bonuses, "bonus");
    }

    return toSalaryStructureResponse(await attachLinkedPolicies(
      await updateSalaryStructureById(id, normalizeSalaryStructurePayload(payload))
    ));
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const generatePayrollService = async ({ employee_id, month, year }) => {
  try {
    if (employee_id) {
      return generatePayrollForEmployee(employee_id, month, year);
    }

    const employeeIds = await listActiveSalaryStructureEmployeeIds();
    if (!employeeIds.length) {
      throw error(404, "No employees with active salary structures found");
    }

    const payrolls = [];
    for (const id of employeeIds) {
      payrolls.push(await generatePayrollForEmployee(id, month, year));
    }

    return payrolls;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const regeneratePayrollService = async (payrollId) => {
  try {
    const existing = await fetchPayrollById(payrollId);

    await deletePayslipByPayrollId(payrollId);
    await deletePayrollById(payrollId);

    return generatePayrollForEmployee(existing.employee_id, existing.month, existing.year);
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getPayrollByEmployeeService = async (employeeId, query = {}) => {
  try {
    const result = await listPayrollByEmployee(employeeId, query);

    if (result.payroll) {
      return { payroll: await attachEmployee(result.payroll) };
    }

    const employee = await getEmployee(employeeId);
    return {
      employee,
      payrolls: (result.payrolls || []).map((row) => ({
        ...row,
        employee,
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / result.limit),
      },
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getPayrollByIdService = async (id) => {
  try {
    return attachEmployee(await fetchPayrollById(id));
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

const transitionPayrollStatus = async (id, nextStatus, allowedStatuses) => {
  const payroll = await fetchPayrollById(id);
  if (!allowedStatuses.includes(payroll.status)) {
    throw error(409, `Payroll cannot transition from ${payroll.status} to ${nextStatus}`);
  }

  const now = new Date().toISOString();
  const updates = {
    status: nextStatus,
    updated_at: now,
    ...(nextStatus === "processed" ? { processed_at: now } : {}),
    ...(nextStatus === "paid" ? { paid_at: now } : {}),
  };

  return attachEmployee(await updatePayrollStatus(id, updates));
};

export const approvePayrollService = async (id) => transitionPayrollStatus(id, "processed", ["draft"]);

export const markPayrollPaidService = async (id) => transitionPayrollStatus(id, "paid", ["processed"]);

export const getPayslipService = async (payrollId) => {
  try {
    const payroll = await fetchPayrollById(payrollId);
    const payslip = await findPayslipByPayrollId(payrollId);

    return {
      payroll: await attachEmployee(payroll),
      payslip: payslip || null,
      snapshot: payslip?.snapshot || payroll.summary_snapshot || null,
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};
