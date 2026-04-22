import {
  approvePayrollService,
  createSalaryStructureService,
  generatePayrollService,
  getSalaryStructureByEmployeeService,
  getSalaryStructureByIdService,
  getSalaryStructuresService,
  getPayrollByEmployeeService,
  getPayslipService,
  markPayrollPaidService,
  regeneratePayrollService,
  updateSalaryStructureService,
} from "../services/payroll.service.js";
import { generatePayslipPdf } from "../utils/payslip.js";
import { supabase } from "../config/supabase.js";

const handleError = (res, err) =>
  res.status(err.status || 500).json({
    success: false,
    message: err.message,
  });

const getCompactPayrollPayload = (data) => (
  data.payroll
    ? { payroll: toCompactPayrollResponse(data.payroll) }
    : {
        ...data,
        payrolls: (data.payrolls || []).map((item) => toCompactPayrollResponse(item)),
      }
);

const pickEmployeeSummary = (employee) => {
  if (!employee) return null;
  return {
    id: employee.id,
    first_name: employee.first_name,
    last_name: employee.last_name,
    designation: employee.designation,
    department: employee.department,
  };
};

const toCompactPayrollResponse = (payroll) => {
  const evaluatedAttendance =
    payroll?.attendance_snapshot?.summary?.evaluated_attendance?.summary ||
    payroll?.summary_snapshot?.evaluated_attendance?.summary ||
    null;
  const taxAmount = Number(payroll?.deductions_breakdown?.tax?.amount || 0);
  const deductionsTotal = Number(payroll?.deductions_total || 0);
  const payableBonusItems = (payroll?.earnings_breakdown?.bonuses || [])
    .map((item) => ({
      name: item.name,
      type: item.type,
      value: Number(item.value || 0),
      amount: Number(item.amount || 0),
      eligible: Boolean(item.eligible),
      ineligibility_reason: item.ineligibility_reason || null,
    }))
    .filter((item) => item.amount > 0);

  return {
    id: payroll.id,
    employee_id: payroll.employee_id,
    salary_structure_id: payroll.salary_structure_id,
    status: payroll.status,
    period: {
      month: payroll.month,
      year: payroll.year,
      start_date: payroll?.period_snapshot?.start_date || null,
      end_date: payroll?.period_snapshot?.end_date || null,
      working_days: Number(payroll?.period_snapshot?.working_days || payroll.total_days || 0),
    },
    attendance: {
      present_days: Number(payroll.present_days || 0),
      half_days: Number(payroll?.summary_snapshot?.evaluated_attendance?.summary?.half_days || 0),
      half_day_units: Number(payroll?.summary_snapshot?.evaluated_attendance?.summary?.half_day_units || 0),
      paid_leaves: Number(payroll.paid_leaves || 0),
      unpaid_leaves: Number(payroll.unpaid_leaves || 0),
      payable_days: Number(payroll.payable_days || 0),
      late_arrivals: Number(payroll?.summary_snapshot?.late_arrivals || 0),
      proration_factor_percent: Number(payroll?.summary_snapshot?.proration_factor_percent || 0),
      shift_tracking: payroll?.attendance_snapshot?.summary?.shift_tracking || null,
      overtime_tracking: payroll?.attendance_snapshot?.summary?.overtime_tracking || null,
      overtime_breakdown: payroll?.earnings_breakdown?.overtime ? {
        approved_hours: Number(payroll.earnings_breakdown.overtime.approved_hours || 0),
        unapproved_hours: Number(payroll.earnings_breakdown.overtime.unapproved_hours || 0),
        approved_overtime_amount: Number(payroll.earnings_breakdown.overtime.approved_overtime_amount || 0),
        unapproved_overtime_amount: Number(payroll.earnings_breakdown.overtime.unapproved_overtime_amount || 0),
      } : null,
      evaluated: evaluatedAttendance,
    },
    totals: {
      basic_salary: Number(payroll.basic_salary || 0),
      allowances_total: Number(payroll.allowances_total || 0),
      bonuses_total: Number(payroll.bonuses_total || 0),
      approved_overtime_amount: Number(payroll?.earnings_breakdown?.overtime?.approved_overtime_amount || 0),
      unapproved_overtime_amount: Number(payroll?.earnings_breakdown?.overtime?.unapproved_overtime_amount || 0),
      total_overtime_amount: Number(payroll.overtime_amount || 0),
      gross_salary: Number(payroll.gross_salary || 0),
      tax_amount: taxAmount,
      non_tax_deductions_total: Number((deductionsTotal - taxAmount).toFixed(2)),
      deductions_total: deductionsTotal,
      net_salary: Number(payroll.net_salary || 0),
    },
    tax: {
      mode: payroll?.deductions_breakdown?.tax?.mode || null,
      rate: payroll?.deductions_breakdown?.tax?.rate ?? null,
      amount: taxAmount,
    },
    components: {
      allowances: (payroll?.earnings_breakdown?.allowances || []).map((item) => ({
        name: item.name,
        type: item.type,
        value: Number(item.value || 0),
        amount: Number(item.amount || 0),
      })),
      ...(payableBonusItems.length ? { bonuses: payableBonusItems } : {}),
      ...(payroll?.earnings_breakdown?.overtime ? { 
        overtime: {
          approved_hours: Number(payroll.earnings_breakdown.overtime.approved_hours || 0),
          unapproved_hours: Number(payroll.earnings_breakdown.overtime.unapproved_hours || 0),
          hourly_rate: Number(payroll.earnings_breakdown.overtime.hourly_rate || 0),
          approved_rate_multiplier: Number(payroll.earnings_breakdown.overtime.approved_rate_multiplier || 1),
          approved_overtime_amount: Number(payroll.earnings_breakdown.overtime.approved_overtime_amount || 0),
          unapproved_overtime_amount: Number(payroll.earnings_breakdown.overtime.unapproved_overtime_amount || 0),
          note: payroll.earnings_breakdown.overtime.note || null,
        }
      } : {}),
      deductions: (payroll?.deductions_breakdown?.items || []).map((item) => ({
        name: item.name,
        type: item.type,
        value: Number(item.value || 0),
        amount: Number(item.amount || 0),
      })),
    },
    employee: pickEmployeeSummary(payroll.employee),
    generated_at: payroll.generated_at,
    processed_at: payroll.processed_at,
    paid_at: payroll.paid_at,
    created_at: payroll.created_at,
    updated_at: payroll.updated_at,
  };
};

const toCompactSalaryStructureResponse = (salaryStructure) => {
  if (!salaryStructure) return null;

  const mapComponent = (component = {}) => {
    const compact = {
      name: component.name || null,
      type: component.type || null,
      basis: component.basis || null,
      value: Number(component.value || 0),
      apply_proration: component.apply_proration !== undefined ? Boolean(component.apply_proration) : null,
    };

    if (component.eligibility) {
      compact.eligibility = {
        min_present_days: component.eligibility.min_present_days ?? null,
        min_payable_days: component.eligibility.min_payable_days ?? null,
        min_payable_ratio: component.eligibility.min_payable_ratio ?? null,
        max_unpaid_leave_days: component.eligibility.max_unpaid_leave_days ?? null,
        require_full_attendance: component.eligibility.require_full_attendance ?? null,
      };
    }

    return compact;
  };

  return {
    id: salaryStructure.id,
    employee_id: salaryStructure.employee_id,
    name: salaryStructure.name || null,
    currency: salaryStructure.currency || null,
    effective_from: salaryStructure.effective_from || null,
    is_active: Boolean(salaryStructure.is_active),
    basic_salary: Number(salaryStructure.basic_salary || 0),
    allowances: (salaryStructure.allowances || []).map(mapComponent),
    deductions: (salaryStructure.deductions || []).map(mapComponent),
    allowance_total: Number(salaryStructure.allowance_total || 0),
    deduction_total: Number(salaryStructure.deduction_total || 0),
    attendance_policy_id: salaryStructure.attendance_policy_id || null,
    overtime_policy_id: salaryStructure.overtime_policy_id || null,
    tax_policy_id: salaryStructure.tax_policy_id || null,
    bonus_policy_id: salaryStructure.bonus_policy_id || null,
    attendance_policy: salaryStructure.attendance_policy || null,
    overtime_policy: salaryStructure.overtime_policy || null,
    tax_policy: salaryStructure.tax_policy || null,
    bonus_policy: salaryStructure.bonus_policy || null,
    employee: pickEmployeeSummary(salaryStructure.employee),
    created_at: salaryStructure.created_at || null,
    updated_at: salaryStructure.updated_at || null,
  };
};

const getEmployeeIdByAuth = async (authId) => {
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 400 });
  }

  if (!data) {
    throw Object.assign(new Error("Employee profile not found"), { status: 403 });
  }

  return data.id;
};

const enforceEmployeeSelfAccess = async (req, targetEmployeeId) => {
  if (req.user.designation !== "employee") return;

  const ownEmployeeId = await getEmployeeIdByAuth(req.user.auth_id);
  if (ownEmployeeId !== targetEmployeeId) {
    throw Object.assign(new Error("Forbidden: You can only access your own payroll data"), { status: 403 });
  }
};

export const generatePayroll = async (req, res) => {
  try {
    const payload = req.body;

    const payroll = await generatePayrollService(payload);
    const isBulk = Array.isArray(payroll);
    const compactPayroll = isBulk
      ? payroll.map((item) => toCompactPayrollResponse(item))
      : toCompactPayrollResponse(payroll);

    res.status(201).json({
      success: true,
      message: "Payroll generated successfully",
      ...(isBulk ? { payrolls: compactPayroll, total: compactPayroll.length } : { payroll: compactPayroll }),
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const regeneratePayroll = async (req, res) => {
  try {
    const payroll = await regeneratePayrollService(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Payroll regenerated successfully",
      payroll: toCompactPayrollResponse(payroll),
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getPayrollByEmployee = async (req, res) => {
  try {
    await enforceEmployeeSelfAccess(req, req.params.employeeId);

    const data = await getPayrollByEmployeeService(req.params.employeeId, req.validatedQuery || req.query);
    const compactData = getCompactPayrollPayload(data);

    return res.status(200).json({
      success: true,
      message: "Payroll retrieved successfully",
      ...compactData,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getMyPayroll = async (req, res) => {
  try {
    const employeeId = await getEmployeeIdByAuth(req.user.auth_id);
    const data = await getPayrollByEmployeeService(employeeId, req.validatedQuery || req.query);
    const compactData = getCompactPayrollPayload(data);

    return res.status(200).json({
      success: true,
      message: "Your payroll retrieved successfully",
      ...compactData,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const approvePayroll = async (req, res) => {
  try {
    const payroll = await approvePayrollService(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Payroll approved successfully",
      payroll,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const markPayrollPaid = async (req, res) => {
  try {
    const payroll = await markPayrollPaidService(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Payroll marked as paid successfully",
      payroll,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getPayslip = async (req, res) => {
  try {
    const data = await getPayslipService(req.params.id);

    await enforceEmployeeSelfAccess(req, data.payroll.employee_id);

    return generatePayslipPdf(data, res);
  } catch (err) {
    return handleError(res, err);
  }
};

export const createSalaryStructure = async (req, res) => {
  try {
    const data = await createSalaryStructureService(req.body);
    return res.status(201).json({
      success: true,
      message: "Salary structure created successfully",
      salary_structure: toCompactSalaryStructureResponse(data),
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getSalaryStructures = async (req, res) => {
  try {
    const result = await getSalaryStructuresService(req.validatedQuery || req.query);
    return res.status(200).json({
      success: true,
      message: "Salary structures retrieved successfully",
      ...result,
      salary_structures: (result.salary_structures || []).map((row) => toCompactSalaryStructureResponse(row)),
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getSalaryStructureById = async (req, res) => {
  try {
    const data = await getSalaryStructureByIdService(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Salary structure retrieved successfully",
      salary_structure: toCompactSalaryStructureResponse(data),
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getSalaryStructureByEmployee = async (req, res) => {
  try {
    await enforceEmployeeSelfAccess(req, req.params.employee_id);

    const data = await getSalaryStructureByEmployeeService(req.params.employee_id);
    return res.status(200).json({
      success: true,
      message: "Salary structure retrieved successfully",
      salary_structure: toCompactSalaryStructureResponse(data),
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const updateSalaryStructure = async (req, res) => {
  try {
    const data = await updateSalaryStructureService(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Salary structure updated successfully",
      salary_structure: toCompactSalaryStructureResponse(data),
    });
  } catch (err) {
    return handleError(res, err);
  }
};
