const AppError = require("../utils/AppError");
const { validatePassword, PASSWORD_REQUIREMENTS } = require("../utils/password");

// PUT /api/account/password. The current password proves ownership of the
// session; the new password meets the same strength rule as registration
// and admin-assisted resets.
const validatePasswordChange = (req, res, next) => {
  const { currentPassword, newPassword } = req.body || {};
  const errors = [];
  if (typeof currentPassword !== "string" || currentPassword === "") {
    errors.push("Current password is required");
  }
  if (!validatePassword(newPassword)) {
    errors.push(PASSWORD_REQUIREMENTS);
  }
  if (errors.length > 0) {
    return next(new AppError("Validation failed", 400, errors));
  }
  next();
};

module.exports = validatePasswordChange;
