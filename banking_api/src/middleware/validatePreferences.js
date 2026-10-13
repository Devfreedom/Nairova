const AppError = require("../utils/AppError");

const ALLOWED = ["inappMoneyEvents", "emailMoneyEvents", "emailMarketing", "theme"];
const BOOLEAN_KEYS = ["inappMoneyEvents", "emailMoneyEvents", "emailMarketing"];
const THEMES = ["light", "dark", "system"];

// PATCH /api/account/preferences. All keys optional; at least one required.
// Unknown keys are rejected so typos fail loudly instead of silently no-op.
const validatePreferences = (req, res, next) => {
  const body = req.body || {};
  const unknown = Object.keys(body).filter((k) => !ALLOWED.includes(k));
  if (unknown.length > 0) {
    return next(new AppError(`Unknown preference: ${unknown.join(", ")}`, 400));
  }
  const provided = Object.keys(body).filter((k) => ALLOWED.includes(k));
  if (provided.length === 0) {
    return next(new AppError("Provide at least one preference to update", 400));
  }
  const errors = [];
  for (const key of BOOLEAN_KEYS) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") {
      errors.push(`${key} must be true or false`);
    }
  }
  if (body.theme !== undefined && !THEMES.includes(body.theme)) {
    errors.push("theme must be light, dark, or system");
  }
  if (errors.length > 0) {
    return next(new AppError("Validation failed", 400, errors));
  }
  next();
};

module.exports = validatePreferences;
