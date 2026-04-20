import { strictObject, uuidRule } from "./common.validator.js";
import Joi from "joi";

const monthRule = Joi.number().integer().min(1).max(12);
const yearRule = Joi.number().integer().min(2000).max(2100);

export const generatePayrollSchema = strictObject({
  employee_id: uuidRule.optional(),
  month: monthRule.required(),
  year: yearRule.required(),
});

const amountRule = Joi.number().min(0);

export const salaryComponentSchema = Joi.object({
  name: Joi.string().trim().max(100),
  type: Joi.string().valid("fixed", "percentage").required(),
  value: amountRule.required(),
  apply_proration: Joi.boolean(),
}).options({ allowUnknown: false });

const componentCollectionRule = Joi.alternatives().try(
  Joi.array().items(salaryComponentSchema),
  Joi.object().unknown(true),
  amountRule
);

export const salaryStructureCreateSchema = strictObject({
  name: Joi.string().trim().max(150),
  currency: Joi.string().trim().max(10),
  employee_id: uuidRule.required(),
  basic_salary: amountRule.required(),
  attendance_policy_id: uuidRule.required(),
  overtime_policy_id: uuidRule.required(),
  tax_policy_id: uuidRule.required(),
  bonus_policy_id: uuidRule.optional(),
  allowances: Joi.array().items(salaryComponentSchema).default([]),
  deductions: Joi.array().items(salaryComponentSchema).default([]),
  effective_from: Joi.date().iso(),
  is_active: Joi.boolean().default(true)
});

export const salaryStructureUpdateSchema = strictObject({
  name: Joi.string().trim().max(150),
  currency: Joi.string().trim().max(10),
  basic_salary: amountRule,
  basic_salary_type: Joi.string().valid("fixed", "percentage"),
  basic_salary_basis: Joi.string().valid("basic_salary", "gross_salary"),
  attendance_policy_id: uuidRule,
  overtime_policy_id: uuidRule,
  tax_policy_id: uuidRule,
  bonus_policy_id: uuidRule,
  allowances: componentCollectionRule,
  deductions: componentCollectionRule,
  effective_from: Joi.date().iso(),
  is_active: Joi.boolean(),
  basic: amountRule,
  allowance_total: amountRule,
  deduction_total: amountRule,
  bonus: amountRule,
  bonus_total: amountRule,
  tax_percent: Joi.number().min(0).max(100),
}).min(1);

export const salaryStructureIdParamSchema = strictObject({
  id: uuidRule.required(),
});

export const salaryStructureEmployeeParamSchema = strictObject({
  employee_id: uuidRule.required(),
});

export const payrollEmployeeParamSchema = strictObject({
  employeeId: uuidRule.required(),
});

export const payrollIdParamSchema = strictObject({
  id: uuidRule.required(),
});

export const salaryStructureListQuerySchema = strictObject({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  employee_id: uuidRule.optional(),
});

export const payrollEmployeeQuerySchema = strictObject({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  month: monthRule,
  year: yearRule,
  status: Joi.string().valid("draft", "processed", "paid"),
});
