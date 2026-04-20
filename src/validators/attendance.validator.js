import Joi from "joi";
import {
  hasInvalidTimeRange,
  hasSameTime,
  isoDateRule,
  limitRule,
  pageRule,
  parseFriendlyDate,
  strictObject,
  timeHHmmRule,
  uuidRule,
} from "./common.validator.js";

const friendlyDateRule = Joi.alternatives()
  .try(Joi.date().iso(), Joi.string().pattern(/^\d{2}[/-]\d{2}[/-]\d{4}$/))
  .messages({
    "alternatives.match": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
    "date.format": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
    "string.pattern.base": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
  });
const attendanceStatusRule = Joi.string()
  .valid(
    "online",
    "offline",
    "absent",
    "holiday",
    "leave",
    "break",
    "PRESENT",
    "ABSENT",
    "ON_LEAVE",
    "ON_LEAVE_WORKING"
  );
const requestStatusRule = Joi.string().valid("pending", "approved", "rejected");
export const createShiftSchema = strictObject({
  name: Joi.string().trim().required(),
  start_time: timeHHmmRule.required(),
  end_time: timeHHmmRule.required(),
  duration_hours: Joi.number().positive().max(24).required(),
})
  .custom((value, helpers) => {
    if (hasSameTime(value.start_time, value.end_time)) {
      return helpers.message("Start time and end time cannot be the same");
    }

    return value;
  });

export const updateShiftSchema = strictObject({
  name: Joi.string().trim(),
  start_time: timeHHmmRule,
  end_time: timeHHmmRule,
  duration_hours: Joi.number().positive().max(24),

  is_active: Joi.boolean(),
})
  .custom((value, helpers) => {
    if (value.start_time && value.end_time && hasSameTime(value.start_time, value.end_time)) {
      return helpers.message("Start time and end time cannot be the same");
    }

    return value;
  });

export const shiftStatusSchema = strictObject({ is_active: Joi.boolean().required() });

export const shiftIdParamSchema = strictObject({ id: uuidRule.required() });

export const assignShiftSchema = strictObject({
  employee_id: uuidRule.required(),
  shift_id: uuidRule.required(),
  assigned_from: isoDateRule.required(),
  assigned_to: isoDateRule.allow(null),

  is_active: Joi.boolean().default(true),
})
  .custom((value, helpers) => {
    const fromDate = new Date(value.assigned_from);
    if (value.assigned_to) {
      const toDate = new Date(value.assigned_to);
      if (toDate < fromDate) {
        return helpers.message("assigned_to must be greater than or equal to assigned_from");
      }
    }

    return value;
  });

export const updateAssignmentSchema = strictObject({
  shift_id: uuidRule,
  assigned_to: isoDateRule.allow(null),

  is_active: Joi.boolean(),
});

export const assignmentIdParamSchema = strictObject({ id: uuidRule.required() });

export const assignmentListQuerySchema = strictObject({
  page: pageRule,
  limit: limitRule,
  employee_id: uuidRule.allow(null),
  shift_id: uuidRule.allow(null),
  is_active: Joi.boolean(),
});

export const checkInSchema = strictObject({
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  notes: Joi.string().trim().max(500).optional(),
});

export const checkOutSchema = strictObject({
  notes: Joi.string().trim().max(500).optional(),
});

export const attendanceRecordIdParamSchema = strictObject({ id: uuidRule.required() });

export const attendanceRecordsQuerySchema = strictObject({
  page: pageRule,
  limit: limitRule,
  employee_id: uuidRule.allow(null),
  date: isoDateRule.allow(null),
  start_date: isoDateRule.allow(null),
  end_date: isoDateRule.allow(null),
  status: attendanceStatusRule.allow(null),
});

export const createShiftChangeRequestSchema = strictObject({
  current_shift_id: uuidRule.required(),
  requested_shift_id: uuidRule.required(),
  request_date: isoDateRule.required(),

  reason: Joi.string().trim().max(500).optional(),
})
  .custom((value, helpers) => {
    if (value.current_shift_id === value.requested_shift_id) {
      return helpers.message("Requested shift must be different from current shift");
    }
    return value;
  });

export const shiftChangeRequestIdParamSchema = strictObject({ id: uuidRule.required() });

export const shiftChangeRequestQuerySchema = strictObject({
  page: pageRule,
  limit: limitRule,
  employee_id: uuidRule.allow(null),
  status: requestStatusRule.allow(null),
});

export const createOvertimeRequestSchema = strictObject({
  date: isoDateRule.required(),
  start_time: timeHHmmRule.required(),
  end_time: timeHHmmRule.required(),
  hours: Joi.number().positive().max(24).required(),

  reason: Joi.string().trim().max(500).optional(),
})
  .custom((value, helpers) => {
    if (hasInvalidTimeRange(value.start_time, value.end_time)) {
      return helpers.message("End time must be greater than start time");
    }

    return value;
  });

export const overtimeRequestIdParamSchema = strictObject({ id: uuidRule.required() });

export const overtimeRequestQuerySchema = strictObject({
  page: pageRule,
  limit: limitRule,
  employee_id: uuidRule.allow(null),
  status: requestStatusRule.allow(null),
});

export const dailyReportQuerySchema = strictObject({
  date: friendlyDateRule.required(),
  department: Joi.string().trim().optional(),
});

export const weeklyReportQuerySchema = strictObject({
  week_of: friendlyDateRule.required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
});

export const monthlyReportQuerySchema = strictObject({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
  department: Joi.string().trim().optional(),
});

export const summaryReportQuerySchema = strictObject({
  team_id: uuidRule.optional(),
  start_date: friendlyDateRule.required(),
  end_date: friendlyDateRule.required(),
})
  .custom((value, helpers) => {
    const startDate = parseFriendlyDate(value.start_date);
    const endDate = parseFriendlyDate(value.end_date);
    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return helpers.message("Start date and end date must be in YYYY-MM-DD or DD-MM-YYYY format");
    }

    if (endDate < startDate) {
      return helpers.message("End date must be greater than or equal to start date");
    }

    return value;
  });
