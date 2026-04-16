import Joi from "joi";
import { emailRule, passwordRule, strictObject, uuidRule } from "./common.validator.js";

const roleRule = Joi.string().trim().valid("employee", "hr", "manager");

export const signinSchema = strictObject({
  email: emailRule.required(),
  password: Joi.string().required(),
});

export const adminCreateUserSchema = strictObject({
  email: emailRule.required(),
  password: passwordRule.required(),
  name: Joi.string().trim().required(),
  role: roleRule.default("employee"),
});

export const userIdParamSchema = strictObject({ id: uuidRule.required() });

export const adminUpdateUserSchema = strictObject({
  email: emailRule,
  password: passwordRule,
  name: Joi.string().trim(),
  role: roleRule,
})
  .min(1);
