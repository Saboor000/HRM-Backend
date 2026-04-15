import Joi from "joi";

const uuid = Joi.string().guid({ version: ["uuidv4", "uuidv5"] });
const email = Joi.string().trim().email();
const password = Joi.string().min(8).max(64);
const role = Joi.string().trim().valid("employee", "hr", "manager");

export const signinSchema = Joi.object({
  email: email.required(),
  password: Joi.string().required(),
}).options({ allowUnknown: false });

export const adminCreateUserSchema = Joi.object({
  email: email.required(),
  password: password.required(),
  name: Joi.string().trim().required(),
  role: role.default("employee"),
}).options({ allowUnknown: false });

export const userIdParamSchema = Joi.object({
  id: uuid.required(),
}).options({ allowUnknown: false });

export const adminUpdateUserSchema = Joi.object({
  email,
  password,
  name: Joi.string().trim(),
  role,
})
  .min(1)
  .options({ allowUnknown: false });
