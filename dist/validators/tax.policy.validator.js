import Joi from 'joi';
const sendValidationError = (res, details) => res.status(400).json({ message: 'Validation error', details: details.map((detail) => detail.message) });
const validateSchema = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error)
        return sendValidationError(res, error.details);
    next();
};
const taxPolicySchema = Joi.object({
    name: Joi.string().required().trim().description('Unique name for the tax policy'),
    tax_mode_default: Joi.string().valid('slab', 'fixed', 'percentage').default('slab').description('Default tax calculation mode'),
    apply_proration_default: Joi.boolean().default(false).description('Whether fixed tax should be prorated by payable-days ratio'),
    tax_rate_default: Joi.number().min(0),
    tax_slabs: Joi.array().items(Joi.object({
        up_to: Joi.number().allow(null),
        rate: Joi.number().required()
    })).when('tax_mode_default', {
        is: 'slab',
        then: Joi.required(),
        otherwise: Joi.forbidden()
    }),
}).custom((value, helpers) => {
    if ((value.tax_mode_default === 'percentage' || value.tax_mode_default === 'fixed') && value.tax_rate_default === undefined) {
        return helpers.error('any.custom', { message: 'tax_rate_default is required when tax_mode_default is percentage or fixed' });
    }
    if (value.tax_mode_default === 'slab' && value.tax_rate_default !== undefined) {
        return helpers.error('any.custom', { message: 'tax_rate_default is only allowed when tax_mode_default is percentage or fixed' });
    }
    return value;
});
const taxPolicyUpdateSchema = Joi.object({
    name: Joi.string().trim().description('Unique name for the tax policy'),
    tax_mode_default: Joi.string().valid('slab', 'fixed', 'percentage').description('Default tax calculation mode'),
    apply_proration_default: Joi.boolean(),
    tax_rate_default: Joi.number().min(0),
    tax_slabs: Joi.array().items(Joi.object({
        up_to: Joi.number().allow(null),
        rate: Joi.number().required(),
    })),
})
    .min(1)
    .custom((value, helpers) => {
    if (value.tax_mode_default === 'slab' && !Array.isArray(value.tax_slabs)) {
        return helpers.error('any.custom', { message: 'tax_slabs is required when tax_mode_default is slab' });
    }
    if (value.tax_mode_default && value.tax_mode_default !== 'slab' && Array.isArray(value.tax_slabs)) {
        return helpers.error('any.custom', { message: 'tax_slabs is only allowed when tax_mode_default is slab' });
    }
    if ((value.tax_mode_default === 'percentage' || value.tax_mode_default === 'fixed') && value.tax_rate_default === undefined) {
        return helpers.error('any.custom', { message: 'tax_rate_default is required when tax_mode_default is percentage or fixed' });
    }
    if (value.tax_mode_default === 'slab' && value.tax_rate_default !== undefined) {
        return helpers.error('any.custom', { message: 'tax_rate_default is only allowed when tax_mode_default is percentage or fixed' });
    }
    return value;
}, 'tax policy update validation');
export const createTaxPolicyValidator = validateSchema(taxPolicySchema);
export const updateTaxPolicyValidator = validateSchema(taxPolicyUpdateSchema);
//# sourceMappingURL=tax.policy.validator.js.map