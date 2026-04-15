import Joi from "joi";

const timeRule = Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).messages({
  "string.pattern.base": "Time must be in HH:mm format (24-hour)",
});
const uuidRule = Joi.string().guid({ version: ["uuidv4", "uuidv5"] }).messages({
  "string.guid": "Must be a valid UUID",
});
const friendlyDateRule = Joi.alternatives()
  .try(Joi.date().iso(), Joi.string().pattern(/^\d{2}[/-]\d{2}[/-]\d{4}$/))
  .messages({
    "alternatives.match": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
    "date.format": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
    "string.pattern.base": "Date must be in YYYY-MM-DD or DD-MM-YYYY format",
  });
const parseFriendlyDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return match ? new Date(`${match[3]}-${match[2]}-${match[1]}`) : new Date(value);
};
const hasInvalidTimeRange = (start, end) => {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  return endH * 60 + endM <= startH * 60 + startM;
};
const hasSameTime = (start, end) => {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  return endH * 60 + endM === startH * 60 + startM;
};

export const createShiftSchema = Joi.object({
  name: Joi.string().trim().required(),
  start_time: timeRule.required(),
  end_time: timeRule.required(),
  duration_hours: Joi.number().positive().max(24).required(),
})
  .custom((value, helpers) => {
    if (hasSameTime(value.start_time, value.end_time)) {
      return helpers.error("any.invalid", {
        message: "Start time and end time cannot be the same",
      });
    }

    return value;
  })
  .options({ allowUnknown: false });

export const updateShiftSchema = Joi.object({
  name: Joi.string().trim(),
  start_time: timeRule,
  end_time: timeRule,
  duration_hours: Joi.number().positive().max(24),

  is_active: Joi.boolean(),
})
  .custom((value, helpers) => {
    if (value.start_time && value.end_time && hasSameTime(value.start_time, value.end_time)) {
      return helpers.error("any.invalid", {
        message: "Start time and end time cannot be the same",
      });
    }

    return value;
  })
  .options({ allowUnknown: false });

export const shiftStatusSchema = Joi.object({
  is_active: Joi.boolean().required(),
}).options({ allowUnknown: false });

export const shiftIdParamSchema = Joi.object({
  id: uuidRule.required(),
}).options({ allowUnknown: false });

export const assignShiftSchema = Joi.object({
  employee_id: uuidRule.required(),
  shift_id: uuidRule.required(),
  assigned_from: Joi.date().iso().required(),
  assigned_to: Joi.date().iso().allow(null),

  is_active: Joi.boolean().default(true),
})
  .custom((value, helpers) => {
    const fromDate = new Date(value.assigned_from);
    if (value.assigned_to) {
      const toDate = new Date(value.assigned_to);
      if (toDate < fromDate) {
        return helpers.error("any.invalid", {
          message: "assigned_to must be greater than or equal to assigned_from",
        });
      }
    }

    return value;
  })
  .options({ allowUnknown: false });

export const updateAssignmentSchema = Joi.object({
  shift_id: uuidRule,
  assigned_to: Joi.date().iso().allow(null),

  is_active: Joi.boolean(),
})
  .options({ allowUnknown: false });

export const assignmentIdParamSchema = Joi.object({
  id: uuidRule.required(),
}).options({ allowUnknown: false });

export const assignmentListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  employee_id: uuidRule.allow(null),
  shift_id: uuidRule.allow(null),
  is_active: Joi.boolean(),
})
  .options({ allowUnknown: false });

export const checkInSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  notes: Joi.string().trim().max(500).optional(),
})
  .options({ allowUnknown: false });

export const checkOutSchema = Joi.object({
  notes: Joi.string().trim().max(500).optional(),
})
  .options({ allowUnknown: false });

export const attendanceRecordIdParamSchema = Joi.object({
  id: uuidRule.required(),
}).options({ allowUnknown: false });

export const attendanceRecordsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  employee_id: uuidRule.allow(null),
  date: Joi.date().iso().allow(null),
  start_date: Joi.date().iso().allow(null),
  end_date: Joi.date().iso().allow(null),
  status: Joi.string()
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
    )
    .allow(null),
})
  .options({ allowUnknown: false });

export const createShiftChangeRequestSchema = Joi.object({
  current_shift_id: uuidRule.required(),
  requested_shift_id: uuidRule.required(),
  request_date: Joi.date().iso().required(),

  reason: Joi.string().trim().max(500).optional(),
})
  .custom((value, helpers) => {
    if (value.current_shift_id === value.requested_shift_id) {
      return helpers.error("any.invalid", {
        message: "Requested shift must be different from current shift",
      });
    }
    return value;
  })
  .options({ allowUnknown: false });

export const shiftChangeRequestIdParamSchema = Joi.object({
  id: uuidRule.required(),
}).options({ allowUnknown: false });

export const shiftChangeRequestQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  employee_id: uuidRule.allow(null),
  status: Joi.string()
    .valid("pending", "approved", "rejected")
    .allow(null),
})
  .options({ allowUnknown: false });

export const createOvertimeRequestSchema = Joi.object({
  date: Joi.date().iso().required(),
  start_time: timeRule.required(),
  end_time: timeRule.required(),
  hours: Joi.number().positive().max(24).required(),

  reason: Joi.string().trim().max(500).optional(),
})
  .custom((value, helpers) => {
    if (hasInvalidTimeRange(value.start_time, value.end_time)) {
      return helpers.error("any.invalid", {
        message: "End time must be greater than start time",
      });
    }

    return value;
  })
  .options({ allowUnknown: false });

export const overtimeRequestIdParamSchema = Joi.object({
  id: uuidRule.required(),
}).options({ allowUnknown: false });

export const overtimeRequestQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  employee_id: uuidRule.allow(null),
  status: Joi.string()
    .valid("pending", "approved", "rejected")
    .allow(null),
})
  .options({ allowUnknown: false });

export const dailyReportQuerySchema = Joi.object({
  date: friendlyDateRule.required(),
  department: Joi.string().trim().optional(),
})
  .options({ allowUnknown: false });

export const weeklyReportQuerySchema = Joi.object({
  week_of: friendlyDateRule.required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
})
  .options({ allowUnknown: false });

export const monthlyReportQuerySchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
  department: Joi.string().trim().optional(),
})
  .options({ allowUnknown: false });

export const summaryReportQuerySchema = Joi.object({
  team_id: uuidRule.optional(),
  start_date: friendlyDateRule.required(),
  end_date: friendlyDateRule.required(),
})
  .custom((value, helpers) => {
    const startDate = parseFriendlyDate(value.start_date);
    const endDate = parseFriendlyDate(value.end_date);
    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return helpers.error("any.invalid", {
        message: "Start date and end date must be in YYYY-MM-DD or DD-MM-YYYY format",
      });
    }

    if (endDate < startDate) {
      return helpers.error("any.invalid", {
        message: "End date must be greater than or equal to start date",
      });
    }

    return value;
  })
  .options({ allowUnknown: false });
