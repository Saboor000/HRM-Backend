import Joi from "joi";

const leaveTypes = ["full_day", "half_day", "short_leave"];
const leaveStatuses = ["pending", "approved", "rejected", "cancelled"];
const uuid = Joi.string().guid({ version: ["uuidv4", "uuidv5"] });
const isoDate = Joi.date().iso();

const hhmmRule = Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/);
const isEndBeforeStart = (start, end) => new Date(end) < new Date(start);

export const leaveIdParamSchema = Joi.object({
  id: uuid.required(),
}).options({ allowUnknown: false });

export const createLeaveSchema = Joi.object({
  leave_type: Joi.string().valid(...leaveTypes).required(),

  start_date: Joi.when("leave_type", {
    is: Joi.valid("full_day", "half_day"),
    then: isoDate.required(),
    otherwise: Joi.any().strip(),
  }),

  end_date: Joi.when("leave_type", {
    is: "full_day",
    then: isoDate.required(),
    otherwise: Joi.any().strip(),
  }),

  half_day_type: Joi.when("leave_type", {
    is: "half_day",
    then: Joi.string().valid("morning", "evening").required(),
    otherwise: Joi.any().strip(),
  }),

  start_time: Joi.when("leave_type", {
    is: "short_leave",
    then: hhmmRule.required(),
    otherwise: Joi.any().strip(),
  }),

  end_time: Joi.when("leave_type", {
    is: "short_leave",
    then: hhmmRule.required(),
    otherwise: Joi.any().strip(),
  }),

  reason: Joi.string().trim().max(500).allow(""),
})
  .custom((value, helpers) => {
    if (value.leave_type === "full_day" && isEndBeforeStart(value.start_date, value.end_date)) {
      return helpers.error("any.invalid", {
        message: "end_date must be greater than or equal to start_date",
      });
    }

    return value;
  })
  .options({ allowUnknown: false });

export const rejectLeaveSchema = Joi.object({
  rejection_reason: Joi.string().trim().required(),
}).options({ allowUnknown: false });

export const cancelLeaveSchema = Joi.object({
  cancel_reason: Joi.string().trim().max(500).allow(""),
}).options({ allowUnknown: false });

export const leaveListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid(...leaveStatuses),
  leave_type: Joi.string().valid(...leaveTypes),
  employee_id: uuid,
  start_date: Joi.string().isoDate(),
  end_date: Joi.string().isoDate(),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
})
  .custom((value, helpers) => {
    if (value.start_date && value.end_date && isEndBeforeStart(value.start_date, value.end_date)) {
      return helpers.error("any.invalid", {
        message: "end_date must be greater than or equal to start_date",
      });
    }

    return value;
  })
  .options({ allowUnknown: false });
