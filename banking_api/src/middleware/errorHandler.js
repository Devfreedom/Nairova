const errorHandler = (err, req, res, next) => {
  if (!err.isOperational && err.type !== "entity.parse.failed") {
    console.error(err);
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON in request body" });
  }

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }

  res.status(500).json({ success: false, message: "Something went wrong" });
};

module.exports = errorHandler;