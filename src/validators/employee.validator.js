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

// export const updateEmployeeSchema = Joi.object({
//   firstName: Joi.string().trim().min(2).max(50),
//   lastName: Joi.string().trim().min(2).max(50),
//   dob: Joi.date().iso(),
//   gender: Joi.string().trim().valid("male", "female", "other"),
//   phone: Joi.string().trim().min(7).max(20),
//   address: Joi.string().trim().min(5).max(200),
//   department: Joi.string().trim().min(2).max(60),
//   joiningDate: Joi.date().iso(),
//   employmentType: Joi.string().trim().valid("full_time", "part_time", "contract", "intern"),
//   emergencyName: Joi.string().trim().min(2).max(80),
//   emergencyPhone: Joi.string().trim().min(7).max(20),
//   role: roleSchema,
//   is_active: Joi.boolean(),
// })
// validators/employee.validator.js

export const updateEmployeeSchema = Joi.object({

  firstName:       Joi.string().optional(),
  lastName:        Joi.string().optional(),
  dob:             Joi.string().optional(),
  gender:          Joi.string().valid("male", "female", "other").optional(),
  phone:           Joi.string().optional(),
  address:         Joi.string().optional(),
  employeeId:      Joi.string().optional(),
  department:      Joi.string().optional(),
  role:            Joi.string().valid("employee", "hr", "manager").optional(),
  joiningDate:     Joi.string().optional(),
  employmentType:  Joi.string().valid("full_time", "part_time", "contract", "intern").optional(),
  emergencyName:   Joi.string().optional(),
  emergencyPhone:  Joi.string().optional(),
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
