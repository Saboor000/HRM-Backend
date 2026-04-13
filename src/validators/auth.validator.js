import Joi from "joi";

const passwordRule = Joi.string()
  .min(8)
  .max(64)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
  .required()
  .messages({
    "string.empty": "Password is required",
    "string.min": "Password must be at least 8 characters",
    "string.max": "Password cannot exceed 64 characters",
    "string.pattern.base":
      "Password must include uppercase, lowercase, number, and special character",
    "any.required": "Password is required",
  });

export const signinSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
}).options({ allowUnknown: false });

export const adminCreateUserSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: passwordRule,
  name: Joi.string().trim().min(2).max(60).required().messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 60 characters",
    "any.required": "Name is required",
  }),
  role: Joi.string()
    .trim()
    .valid("employee", "hr", "manager")
    .default("employee")
    .messages({
      "any.only": "Role must be one of: employee, hr, manager",
    }),
}).options({ allowUnknown: false });

export const userIdParamSchema = Joi.object({
  id: Joi.string().guid({ version: ["uuidv4", "uuidv5"] }).required().messages({
    "string.guid": "User id must be a valid UUID",
    "any.required": "User id is required",
  }),
}).options({ allowUnknown: false });

export const adminUpdateUserSchema = Joi.object({
  email: Joi.string().trim().email().messages({
    "string.email": "Please provide a valid email address",
  }),
  password: Joi.string()
    .min(8)
    .max(64)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.max": "Password cannot exceed 64 characters",
      "string.pattern.base":
        "Password must include uppercase, lowercase, number, and special character",
    }),
  name: Joi.string().trim().min(2).max(60).messages({
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 60 characters",
  }),
  role: Joi.string().trim().valid("employee", "hr", "manager").messages({
    "any.only": "Role must be one of: employee, hr, manager",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update user",
  })
  .options({ allowUnknown: false });
