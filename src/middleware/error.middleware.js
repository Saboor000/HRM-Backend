export const notFound = (req, res, next) => {
  const error = new Error(`Not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  if (err?.name === "MulterError") {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "File too large. Maximum allowed size is 5MB"
      : err.message;

    return res.status(400).json({ message });
  }

  if (err?.message?.includes("Invalid file type") || err?.message?.includes("Unexpected file field")) {
    return res.status(400).json({ message: err.message });
  }

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    message: err.message || "Internal server error",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

