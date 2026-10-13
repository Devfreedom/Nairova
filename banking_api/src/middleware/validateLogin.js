const AppError = require("../utils/AppError");

const validateLogin = (req, res, next) => {
  const { email, password } = req.body || {};

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return next(new AppError("Email and password are required", 400));
  }

  req.body.email = email.trim().toLowerCase();
  next();
};

module.exports = validateLogin;