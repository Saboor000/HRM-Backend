import Joi from "joi";
import {
  hasInvalidTimeRange,
  isEndDateBeforeStart,
  isoDateRule,
  limitRule,
  pageRule,
  sortOrderRule,
  strictObject,
  timeHHmmRule,
  uuidRule,
} from "./common.validator.js";

const leaveTypes = ["full_day", "half_day", "short_leave"];
const leaveStatuses = ["pending", "approved", "rejected", "cancelled"];
const singleDayTypes = new Set(["half_day", "short_leave"]);
const hasLeaveDate = (value) => Boolean(value.leave_date || value.start_date);

const normalizeSingleDayFields = (value) => {
  const normalizedLeaveDate = value.leave_date || value.start_date;
  if (!singleDayTypes.has(value.leave_type) || !normalizedLeaveDate) return;

  value.leave_date = normalizedLeaveDate;
  value.start_date = normalizedLeaveDate;
  value.end_date = normalizedLeaveDate;
};

const normalizeFullDayFields = (value) => {
  if (value.leave_type !== "full_day") return;

  if (value.leave_date) {
    value.start_date = value.start_date || value.leave_date;
    value.end_date = value.end_date || value.leave_date;
  }

  if (value.start_date === value.end_date) {
    value.leave_date = value.start_date;
  } else {
    delete value.leave_date;
  }
};

const cleanupTypeSpecificFields = (value) => {
  if (value.leave_type !== "half_day") {
    delete value.half_day_type;
  }

  if (value.leave_type !== "short_leave") {
    delete value.start_time;
    delete value.end_time;
  }

  if (value.leave_type !== "full_day") {
    delete value.end_date;
  }

  if (singleDayTypes.has(value.leave_type)) {
    value.end_date = value.start_date;
  }
};

export const leaveIdParamSchema = strictObject({ id: uuidRule.required() });

export const createLeaveSchema = strictObject({
  leave_type: Joi.string().valid(...leaveTypes).required(),

  leave_date: isoDateRule,
  start_date: isoDateRule,
  end_date: isoDateRule,
  half_day_type: Joi.string().valid("morning", "evening"),
  start_time: timeHHmmRule,
  end_time: timeHHmmRule,
  reason: Joi.string().trim().max(500).allow(""),
})
  .custom((value, helpers) => {
    if (value.leave_type === "full_day") {
      const start = value.start_date || value.leave_date;
      const end = value.end_date || value.leave_date;

      if (!start || !end) {
        return helpers.message("full_day requires leave_date or start_date and end_date");
      }

      if (isEndDateBeforeStart(start, end)) {
        return helpers.message("end_date must be greater than or equal to start_date");
      }
    }

    if (value.leave_type === "half_day") {
      if (!hasLeaveDate(value)) {
        return helpers.message("half_day requires leave_date");
      }

      if (!value.half_day_type) {
        return helpers.message("half_day_type is required for half_day leave");
      }
    }

    if (value.leave_type === "short_leave") {
      if (!hasLeaveDate(value)) {
        return helpers.message("short_leave requires leave_date");
      }

      if (!value.start_time || !value.end_time) {
        return helpers.message("start_time and end_time are required for short_leave");
      }

      if (hasInvalidTimeRange(value.start_time, value.end_time)) {
        return helpers.message("End time must be greater than start time");
      }
    }

    normalizeSingleDayFields(value);
    normalizeFullDayFields(value);
    cleanupTypeSpecificFields(value);

    if (value.leave_type === "full_day" && !value.start_date) {
      return helpers.message("start_date is required for full_day leave");
    }

    return value;
  });

export const rejectLeaveSchema = strictObject({
  rejection_reason: Joi.string().trim().required(),
});

export const leaveDecisionSchema = strictObject({
  action: Joi.string().valid("approved", "rejected").required(),
  rejection_reason: Joi.when("action", {
    is: "rejected",
    then: Joi.string().trim().required(),
    otherwise: Joi.string().trim().allow("", null).optional(),
  }),
});

export const cancelLeaveSchema = strictObject({
  cancel_reason: Joi.string().trim().max(500).allow(""),
});

export const leaveListQuerySchema = strictObject({
  page: pageRule,
  limit: limitRule,
  status: Joi.string().valid(...leaveStatuses),
  manager_status: Joi.string().valid("pending", "approved", "rejected"),
  hr_status: Joi.string().valid("pending", "approved", "rejected"),
  leave_type: Joi.string().valid(...leaveTypes),
  employee_id: uuidRule,
  start_date: Joi.string().isoDate(),
  end_date: Joi.string().isoDate(),
  sortOrder: sortOrderRule,
})
  .custom((value, helpers) => {
    if (value.start_date && value.end_date && isEndDateBeforeStart(value.start_date, value.end_date)) {
      return helpers.message("end_date must be greater than or equal to start_date");
    }

    return value;
  });
