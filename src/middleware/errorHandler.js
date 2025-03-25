const errorHandler = (error, req, res, next) => {
  console.error("Error details:", {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    message:
      "An unexpected error occurred on the server. Please try again later.",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
};

module.exports = errorHandler;
