const AppError = require("../utils/AppError");

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new AppError("Forbidden: you do not have permission to do this portal", 403));
    }
    next();
  };
};

module.exports = authorize;