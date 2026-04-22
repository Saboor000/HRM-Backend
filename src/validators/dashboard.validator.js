import Joi from "joi";
import { limitRule, pageRule, parseFriendlyDate, strictObject, uuidRule } from "./common.validator.js";

const friendlyDateRule = Joi.alternatives()
  .try(Joi.date().iso(), Joi.string().pattern(/^\d{2}[/-]\d{2}[/-]\d{4}$/))
  .messages({
    "alternatives.match": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
    "date.format": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
    "string.pattern.base": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
  });

const dashboardQueryBase = {
  start_date: friendlyDateRule,
  end_date: friendlyDateRule,
  month: Joi.number().integer().min(1).max(12),
  year: Joi.number().integer().min(2000).max(2100),
  department: Joi.string().trim().max(100),
  employee_id: uuidRule,
  page: pageRule,
  limit: limitRule,
};

const withDateRangeValidation = (schema) =>
  schema.custom((value, helpers) => {
    if (value.start_date && value.end_date) {
      const startDate = parseFriendlyDate(value.start_date);
      const endDate = parseFriendlyDate(value.end_date);

      if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
        return helpers.message("Start date and end date must be in YYYY-MM-DD or DD-MM-YYYY format");
      }

      if (endDate < startDate) {
        return helpers.message("End date must be greater than or equal to start date");
      }
    }

    return value;
  });

export const dashboardOverviewQuerySchema = withDateRangeValidation(
  strictObject({
    ...dashboardQueryBase,
  })
);

export const dashboardAttendanceAnalyticsQuerySchema = withDateRangeValidation(
  strictObject({
    ...dashboardQueryBase,
    group_by: Joi.string().valid("day", "week", "month").default("day"),
    top_n: Joi.number().integer().min(1).max(50).default(10),
  })
);
