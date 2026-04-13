import Joi from "joi";

const roleSchema = Joi.string().trim().valid("employee", "hr", "manager");

export const createEmployeeSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string()
    .min(8)
    .max(64)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.max": "Password cannot exceed 64 characters",
      "string.pattern.base":
        "Password must include uppercase, lowercase, number, and special character",
      "any.required": "Password is required",
    }),
  role: roleSchema.default("employee").messages({
    "any.only": "Role must be one of: employee, hr, manager",
  }),
  firstName: Joi.string().trim().min(2).max(50).required().messages({
    "any.required": "firstName is required",
  }),
  lastName: Joi.string().trim().min(2).max(50).required().messages({
    "any.required": "lastName is required",
  }),
  dob: Joi.date().iso().required().messages({
    "date.format": "dob must be a valid ISO date",
    "any.required": "dob is required",
  }),
  gender: Joi.string().trim().valid("male", "female", "other").required().messages({
    "any.only": "gender must be one of: male, female, other",
    "any.required": "gender is required",
  }),
  phone: Joi.string().trim().min(7).max(20).required().messages({
    "any.required": "phone is required",
  }),
  address: Joi.string().trim().min(5).max(200).required().messages({
    "any.required": "address is required",
  }),
  employeeId: Joi.string().trim().min(2).max(30).required().messages({
    "any.required": "employeeId is required",
  }),
  department: Joi.string().trim().min(2).max(60).required().messages({
    "any.required": "department is required",
  }),
  joiningDate: Joi.date().iso().required().messages({
    "date.format": "joiningDate must be a valid ISO date",
    "any.required": "joiningDate is required",
  }),
  employmentType: Joi.string().trim().valid("full_time", "part_time", "contract", "intern").required().messages({
    "any.only": "employmentType must be one of: full_time, part_time, contract, intern",
    "any.required": "employmentType is required",
  }),
  emergencyName: Joi.string().trim().min(2).max(80).required().messages({
    "any.required": "emergencyName is required",
  }),
  emergencyPhone: Joi.string().trim().min(7).max(20).required().messages({
    "any.required": "emergencyPhone is required",
  }),
}).options({ allowUnknown: false });

export const updateEmployeeSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50),
  lastName: Joi.string().trim().min(2).max(50),
  dob: Joi.date().iso(),
  gender: Joi.string().trim().valid("male", "female", "other"),
  phone: Joi.string().trim().min(7).max(20),
  address: Joi.string().trim().min(5).max(200),
  department: Joi.string().trim().min(2).max(60),
  joiningDate: Joi.date().iso(),
  employmentType: Joi.string().trim().valid("full_time", "part_time", "contract", "intern"),
  emergencyName: Joi.string().trim().min(2).max(80),
  emergencyPhone: Joi.string().trim().min(7).max(20),
  role: roleSchema,
  is_active: Joi.boolean(),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update employee",
  })
  .options({ allowUnknown: false });

export const employeeIdParamSchema = Joi.object({
  id: Joi.string().guid({ version: ["uuidv4", "uuidv5"] }).required().messages({
    "string.guid": "Employee id must be a valid UUID",
    "any.required": "Employee id is required",
  }),
}).options({ allowUnknown: false });

export const employeeListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(""),
  role: Joi.string().trim().valid("employee", "hr", "manager"),
  department: Joi.string().trim().max(60),
  employmentType: Joi.string().trim().valid("full_time", "part_time", "contract", "intern"),
  gender: Joi.string().trim().valid("male", "female", "other"),
  sortBy: Joi.string()
    .trim()
    .valid("created_at", "joining_date", "first_name", "last_name", "department", "role")
    .default("created_at"),
  sortOrder: Joi.string().trim().valid("asc", "desc").default("desc"),
}).options({ allowUnknown: false });
