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

export const validateBody = (schema) =>
  validate(schema, (req) => req.body, (req, value) => {
    req.body = value;
  });
export const validateParams = (schema) =>
  validate(schema, (req) => req.params, (req, value) => {
    req.params = value;
  });
export const validateQuery = (schema) =>
  validate(schema, (req) => req.query, (req, value) => {
    req.validatedQuery = value;
  });
