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
const requestStatusRule = Joi.string().valid("pending", "approved", "rejected", "cancelled");
const lateRegularizationTypeRule = Joi.string().valid(
  "late_arrival",
  "missed_checkin",
  "early_checkout",
  "short_hours",
  "shift_mismatch",
  "system_error",
  "transport_issue",
  "weather_issue",
  "medical_reason",
  "official_work",
  "emergency",
  "other"
);
const lateRegularizationStatusRule = Joi.string().valid("pending", "approved", "rejected");
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

export const overtimeDecisionSchema = strictObject({
  action: Joi.string().valid("approved", "rejected").required(),
  rejection_reason: Joi.when("action", {
    is: "rejected",
    then: Joi.string().trim().required(),
    otherwise: Joi.string().trim().allow("", null).optional(),
  }),
});

export const overtimeRequestIdParamSchema = strictObject({ id: uuidRule.required() });

export const overtimeRequestQuerySchema = strictObject({
  page: pageRule,
  limit: limitRule,
  employee_id: uuidRule.allow(null),
  status: requestStatusRule.allow(null),
  manager_status: Joi.string().valid("pending", "approved", "rejected").allow(null),
  hr_status: Joi.string().valid("pending", "approved", "rejected").allow(null),
});

export const regularizationIdParamSchema = strictObject({ id: uuidRule.required() });

export const lateRegularizationSubmitSchema = strictObject({
  attendance_id: uuidRule.required(),
  type: lateRegularizationTypeRule.required(),
  custom_type: Joi.string().trim().min(2).max(100).allow("", null),
  reason: Joi.string().trim().min(5).max(1000).required(),
  supporting_documents: Joi.alternatives().try(
    Joi.array().items(Joi.string().uri()),
    Joi.string().uri()
  ),
}).custom((value, helpers) => {
  if (value.type === "other" && !value.custom_type) {
    return helpers.message("custom_type is required when type is other");
  }
  if (value.type !== "other" && value.custom_type) {
    return helpers.message("custom_type is only allowed when type is other");
  }
  return value;
});

export const lateRegularizationReviewSchema = strictObject({
  status: Joi.string().valid("approved", "rejected").required(),
  remarks: Joi.string().trim().max(1000).allow("", null),
  applied_effect: Joi.boolean(),
  hr_override: Joi.boolean(),
  override_reason: Joi.string().trim().max(500).allow("", null),
}).custom((value, helpers) => {
  if (value.hr_override === true && !value.override_reason) {
    return helpers.message("override_reason is required when hr_override is true");
  }
  return value;
});

export const lateRegularizationListQuerySchema = strictObject({
  page: pageRule,
  limit: limitRule,
  employee_id: uuidRule.allow(null),
  attendance_id: uuidRule.allow(null),
  type: lateRegularizationTypeRule.allow(null),
  custom_type: Joi.string().trim().max(100).allow(null, ""),
  status: lateRegularizationStatusRule.allow(null),
  start_date: isoDateRule.allow(null),
  end_date: isoDateRule.allow(null),
});

const reportTypeRule = Joi.string().valid(
  "daily",
  "weekly",
  "monthly",
  "summary",
  "leaves",
  "overtime"
);

export const reportQuerySchema = strictObject({
  report_type: reportTypeRule.required(),
  page: pageRule,
  limit: limitRule,

  date: friendlyDateRule,
  week_of: friendlyDateRule,
  month: Joi.number().integer().min(1).max(12),
  year: Joi.number().integer().min(2000).max(2100),
  start_date: friendlyDateRule,
  end_date: friendlyDateRule,

  department: Joi.string().trim().max(100),
  team_id: uuidRule,
  employee_id: uuidRule,
  shift_id: uuidRule,

  status: Joi.string().trim().valid(
    "pending",
    "approved",
    "rejected",
    "cancelled",
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
  ),
  manager_status: Joi.string().valid("pending", "approved", "rejected"),
  hr_status: Joi.string().valid("pending", "approved", "rejected"),
  leave_type: Joi.string().valid("full_day", "half_day", "short_leave"),
  is_active: Joi.boolean(),
  has_overtime: Joi.boolean(),
  search: Joi.string().trim().max(100).allow(""),
  role: Joi.string().trim().valid("admin", "employee", "hr", "manager"),
  employmentType: Joi.string().trim().valid("full_time", "part_time", "contract", "intern"),
  gender: Joi.string().trim().valid("male", "female", "other"),
  sortBy: Joi.string().trim().valid("created_at", "joining_date", "first_name", "last_name", "department", "designation").default("created_at"),
  sortOrder: Joi.string().trim().valid("asc", "desc").default("desc"),
})
  .custom((value, helpers) => {
    const { report_type: type } = value;

    if (type === "daily" && !value.date) {
      return helpers.message("date is required for daily report");
    }
    if (type === "weekly" && (!value.week_of || !value.year)) {
      return helpers.message("week_of and year are required for weekly report");
    }
    if (type === "monthly" && (!value.month || !value.year)) {
      return helpers.message("month and year are required for monthly report");
    }
    if (type === "summary" && (!value.start_date || !value.end_date)) {
      return helpers.message("start_date and end_date are required for summary report");
    }

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
