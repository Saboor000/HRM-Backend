import Joi from 'joi';

const sendValidationError = (res, details) =>
  res.status(400).json({ message: 'Validation error', details: details.map((detail) => detail.message) });
const validateSchema = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) return sendValidationError(res, error.details);
  next();
};

const dayToken = Joi.alternatives().try(
  Joi.number().integer().min(0).max(6),
  Joi.string().valid('sun', 'sunday', 'mon', 'monday', 'tue', 'tuesday', 'wed', 'wednesday', 'thu', 'thursday', 'fri', 'friday', 'sat', 'saturday')
);

const stringListOrArray = (itemSchema) =>
  Joi.alternatives().try(
    Joi.string().trim(),
    Joi.array().items(itemSchema)
  );

const attendancePolicySchema = Joi.object({
  name: Joi.string().required().trim().description('Unique name for the attendance policy'),
  timezone: Joi.string().default('UTC').description('Timezone for attendance calculations, e.g., "Asia/Karachi"'),
  apply_proration_default: Joi.boolean().default(true).description('Whether payroll base earnings should be prorated by payable days under this attendance policy'),
  grace_minutes_default: Joi.number().integer().min(0).default(0).description('Default grace period in minutes for late arrivals'),
  late_count_for_unpaid_day: Joi.number().integer().min(1).default(3).description('Number of late arrivals that result in one unpaid day'),
  standard_work_hours_per_day: Joi.number().min(0).default(8).description('Default work hours per day when shift duration is unavailable'),
  full_day_hours: Joi.number().min(0).description('Minimum worked hours required to count a full day'),
  half_day_threshold_hours: Joi.number().min(0).description('Default half-day threshold in hours when min_hours_for_half_day is not provided'),
  min_hours_for_present: Joi.number().min(0).default(0).description('Minimum worked hours required before short-hours behavior applies'),
  min_hours_for_half_day: Joi.number().min(0).description('Minimum worked hours required to count as half day'),
  no_checkout_behavior: Joi.string().valid('present', 'half_day', 'absent').default('present').description('Behavior when employee checks in but has no checkout'),
  short_hours_behavior: Joi.string().valid('present', 'half_day', 'absent').default('absent').description('Behavior when worked hours are below half-day threshold but above min_hours_for_present'),
  short_hours_payable: Joi.number().valid(0, 0.5, 1).default(0).description('Payable fraction for short-hours behavior when marked as present'),
  late_regularization_window_hours: Joi.number().integer().min(1).max(168).default(48).description('Time window in hours for submitting late regularization requests'),
  late_regularization_monthly_limit: Joi.number().integer().min(0).default(4).description('Monthly cap of regularization requests per employee. 0 means unlimited'),
  late_regularization_require_documents: Joi.boolean().default(false).description('Whether supporting documents are mandatory for regularization requests'),
  shift_grace_by_shift_name: Joi.object().pattern(
    Joi.string(),
    Joi.number().integer().min(0)
  ).description('Override grace minutes for specific shifts by shift name'),
  shift_grace_by_shift_id: Joi.object().pattern(
    Joi.string(),
    Joi.number().integer().min(0)
  ).description('Override grace minutes for specific shifts by shift id'),
  weekly_off_days: stringListOrArray(dayToken).description('Weekly off days as CSV or array. Example: "0,6" or ["sunday", "sat"]'),
  working_weekend_dates: stringListOrArray(Joi.string().isoDate()).description('Weekend dates explicitly marked as working. Example: ["2026-04-18"]'),
  holiday_dates: stringListOrArray(Joi.string().isoDate()).description('Public/local holidays to be treated as non-working dates'),
  forced_working_dates: stringListOrArray(Joi.string().isoDate()).description('Dates forced as working even if they are weekly offs/holidays'),
  manual_off_dates: stringListOrArray(Joi.string().isoDate()).description('Dates forced as non-working regardless of weekday')
});

const attendancePolicyUpdateSchema = attendancePolicySchema.fork(
  [
    'name',
    'timezone',
    'apply_proration_default',
    'grace_minutes_default',
    'late_count_for_unpaid_day',
    'standard_work_hours_per_day',
    'full_day_hours',
    'half_day_threshold_hours',
    'min_hours_for_present',
    'min_hours_for_half_day',
    'no_checkout_behavior',
    'short_hours_behavior',
    'short_hours_payable',
    'late_regularization_window_hours',
    'late_regularization_monthly_limit',
    'late_regularization_require_documents',
    'shift_grace_by_shift_name',
    'shift_grace_by_shift_id',
    'weekly_off_days',
    'working_weekend_dates',
    'holiday_dates',
    'forced_working_dates',
    'manual_off_dates',
  ],
  (field) => field.optional()
).min(1);

export const createAttendancePolicyValidator = validateSchema(attendancePolicySchema);
export const updateAttendancePolicyValidator = validateSchema(attendancePolicyUpdateSchema);
