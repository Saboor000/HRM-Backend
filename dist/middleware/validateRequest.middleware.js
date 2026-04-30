const validate = (schema, getter, setter) => (req, res, next) => {
    const { error, value } = schema.validate(getter(req), {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });
    if (error) {
        return res.status(422).json({
            message: error.details?.[0]?.message || "Validation failed",
        });
    }
    setter(req, value);
    return next();
};
const set = (key) => (req, value) => {
    req[key] = value;
};
export const validateBody = (schema) => validate(schema, (req) => req.body, set("body"));
export const validateParams = (schema) => validate(schema, (req) => req.params, set("params"));
export const validateQuery = (schema) => validate(schema, (req) => req.query, set("validatedQuery"));
//# sourceMappingURL=validateRequest.middleware.js.map