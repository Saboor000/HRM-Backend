import Joi from "joi";
import { emailRule, isoDateRule, limitRule, pageRule, passwordRule, sortOrderRule, strictObject, uuidRule } from "./common.validator.js";

const designationRule = Joi.string().trim().valid("admin", "employee", "hr", "manager");
const genderRule = Joi.string().trim().valid("male", "female", "other");
const employmentTypeRule = Joi.string().trim().valid("full_time", "part_time", "contract", "intern");

export const createEmployeeSchema = strictObject({
  email: emailRule.required(),
  password: passwordRule.required(),
  designation: designationRule.default("employee"),
  firstName: Joi.string().trim().required(),
  lastName: Joi.string().trim().required(),
  dob: isoDateRule.required(),
  gender: genderRule.required(),
  phone: Joi.string().trim().required(),
  address: Joi.string().trim().required(),
  employeeId: Joi.string().trim().required(),
  department: Joi.string().trim().required(),
  joiningDate: isoDateRule.required(),
  employmentType: employmentTypeRule.required(),
  emergencyName: Joi.string().trim().required(),
  emergencyPhone: Joi.string().trim().required(),
});

export const updateEmployeeSchema = strictObject({
  firstName: Joi.string().trim(),
  lastName: Joi.string().trim(),
  dob: isoDateRule,
  gender: genderRule,
  phone: Joi.string().trim(),
  address: Joi.string().trim(),
  department: Joi.string().trim(),
  joiningDate: isoDateRule,
  employmentType: employmentTypeRule,
  emergencyName: Joi.string().trim(),
  emergencyPhone: Joi.string().trim(),
  designation: designationRule,
  is_active: Joi.boolean(),
})
  .min(1);

export const employeeIdParamSchema = strictObject({ id: uuidRule.required() });

export const employeeListQuerySchema = strictObject({
  page: pageRule,
  limit: limitRule,
  search: Joi.string().trim().max(100).allow(""),
  role: designationRule,
  department: Joi.string().trim().max(60),
  employmentType: employmentTypeRule,
  gender: genderRule,
  sortBy: Joi.string()
    .trim()
    .valid("created_at", "joining_date", "first_name", "last_name", "department", "designation")
    .default("created_at"),
  sortOrder: sortOrderRule,
});
