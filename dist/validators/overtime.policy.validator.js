import Joi from 'joi';
const sendValidationError = (res, details) => res.status(400).json({ message: 'Validation error', details: details.map((detail) => detail.message) });
const validateSchema = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error)
        return sendValidationError(res, error.details);
    next();
};
const overtimePolicySchema = Joi.object({
    name: Joi.string().required().trim().description('Unique name for the overtime policy'),
    apply_proration_default: Joi.boolean().default(false).description('Whether overtime payout should be prorated by payable-days ratio'),
    require_full_shift_for_overtime: Joi.boolean().default(true).description('When true, overtime is counted only after completing required shift hours (late compensation does not count as overtime)'),
    limit_enforcement_mode: Joi.string().valid('manual', 'strict').default('manual').description('manual = allow with warnings, strict = block on policy violations'),
    standard_work_hours_per_day: Joi.number().min(0).default(8).description('Standard work hours in a day'),
    multiplier: Joi.number().min(0).default(1.5).description('Multiplier for calculating overtime pay against basic salary'),
    min_hours_per_day: Joi.number().min(0).default(0).description('Minimum overtime hours per day to be eligible for overtime pay'),
    max_hours_per_day: Joi.number().min(0).description('Maximum overtime hours allowed per day'),
    max_hours_per_month: Joi.number().min(0).description('Maximum overtime hours allowed per month')
});
export const createOvertimePolicyValidator = validateSchema(overtimePolicySchema);
//# sourceMappingURL=overtime.policy.validator.js.map