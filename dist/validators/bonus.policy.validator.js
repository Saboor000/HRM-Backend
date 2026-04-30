import Joi from 'joi';
const sendValidationError = (res, details) => res.status(400).json({ message: 'Validation error', details: details.map((detail) => detail.message) });
const validateSchema = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error)
        return sendValidationError(res, error.details);
    next();
};
const bonusPolicySchema = Joi.object({
    name: Joi.string().required().trim().description('Unique name for the bonus policy'),
    bonus_mode_default: Joi.string().valid('fixed', 'percentage').required().description('Default bonus calculation mode'),
    bonus_rate_default: Joi.number().min(0).required().description('Default bonus value/rate used by payroll when salary structure does not provide explicit bonus value'),
    apply_proration_default: Joi.boolean().default(true).description('Default proration behavior for policy-driven bonus'),
    min_present_days: Joi.number().integer().min(0),
    min_payable_days: Joi.number().integer().min(0),
    min_payable_ratio: Joi.number().integer().min(0).max(100),
    max_unpaid_leave_days: Joi.number().integer().min(0),
    require_full_attendance: Joi.boolean()
});
const bonusPolicyUpdateSchema = Joi.object({
    name: Joi.string().trim(),
    bonus_mode_default: Joi.string().valid('fixed', 'percentage'),
    bonus_rate_default: Joi.number().min(0),
    apply_proration_default: Joi.boolean(),
    min_present_days: Joi.number().integer().min(0),
    min_payable_days: Joi.number().integer().min(0),
    min_payable_ratio: Joi.number().integer().min(0).max(100),
    max_unpaid_leave_days: Joi.number().integer().min(0),
    require_full_attendance: Joi.boolean(),
}).min(1);
export const createBonusPolicyValidator = validateSchema(bonusPolicySchema);
export const updateBonusPolicyValidator = validateSchema(bonusPolicyUpdateSchema);
//# sourceMappingURL=bonus.policy.validator.js.map