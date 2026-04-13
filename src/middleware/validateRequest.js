export const validateBody = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const firstErrorMessage = error.details?.[0]?.message || "Validation failed";

      return res.status(422).json({
        message: firstErrorMessage,
      });
    }

    req.body = value;
    return next();
  };
};

export const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const firstErrorMessage = error.details?.[0]?.message || "Validation failed";

      return res.status(422).json({
        message: firstErrorMessage,
      });
    }

    req.params = value;
    return next();
  };
};

export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const firstErrorMessage = error.details?.[0]?.message || "Validation failed";

      return res.status(422).json({
        message: firstErrorMessage,
      });
    }

    req.validatedQuery = value;
    return next();
  };
};
