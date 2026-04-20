import Joi from "joi";

const designationSchema = Joi.string().trim().valid("admin", "employee", "hr", "manager");
const uuid = Joi.string().guid({ version: ["uuidv4", "uuidv5"] });
const passwordRule = Joi.string().min(8).max(64);
const isoDate = Joi.date().iso();
const genderSchema = Joi.string().trim().valid("male", "female", "other");
const employmentTypeSchema = Joi.string().trim().valid("full_time", "part_time", "contract", "intern");
const sortBySchema = Joi.string()
  .trim()
  .valid("created_at", "joining_date", "first_name", "last_name", "department", "designation")
  .default("created_at");

export const createEmployeeSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: passwordRule.required(),
  designation: designationSchema.default("employee"),
  firstName: Joi.string().trim().required(),
  lastName: Joi.string().trim().required(),
  dob: isoDate.required(),
  gender: genderSchema.required(),
  phone: Joi.string().trim().required(),
  address: Joi.string().trim().required(),
  employeeId: Joi.string().trim().required(),
  department: Joi.string().trim().required(),
  joiningDate: isoDate.required(),
  employmentType: employmentTypeSchema.required(),
  emergencyName: Joi.string().trim().required(),
  emergencyPhone: Joi.string().trim().required(),
}).options({ allowUnknown: false });

export const updateEmployeeSchema = Joi.object({
  firstName: Joi.string().trim(),
  lastName: Joi.string().trim(),
  dob: isoDate,
  gender: genderSchema,
  phone: Joi.string().trim(),
  address: Joi.string().trim(),
  department: Joi.string().trim(),
  joiningDate: isoDate,
  employmentType: employmentTypeSchema,
  emergencyName: Joi.string().trim(),
  emergencyPhone: Joi.string().trim(),
  designation: designationSchema,
  is_active: Joi.boolean(),
})
  .min(1)
  .options({ allowUnknown: false });

export const employeeIdParamSchema = Joi.object({
  id: uuid.required(),
}).options({ allowUnknown: false });

export const employeeListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(""),
  role: Joi.string().trim().valid("admin", "employee", "hr", "manager"),
  department: Joi.string().trim().max(60),
  employmentType: employmentTypeSchema,
  gender: genderSchema,
  sortBy: sortBySchema,
  sortOrder: Joi.string().trim().valid("asc", "desc").default("desc"),
}).options({ allowUnknown: false });
