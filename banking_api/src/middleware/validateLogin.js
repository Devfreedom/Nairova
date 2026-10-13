const AppError = require("../utils/AppError");
const { classifyIdentifier } = require("../utils/identifier");

const validateLogin = (req, res, next) => {
  const { email, identifier, password } = req.body || {};

  if (typeof password !== "string" || !password) {
    return next(new AppError("Email/phone number and password are required", 400));
  }

  // New contract { identifier } takes precedence; legacy { email } still works,
  // and a phone number sent inside { email } is accepted for compatibility.
  const raw =
    typeof identifier === "string" && identifier.trim() !== ""
      ? identifier
      : typeof email === "string"
        ? email
        : "";
  const classified = classifyIdentifier(raw);
  if (!classified.ok) {
    return next(new AppError(classified.error, 400));
  }

  req.body.identifier = classified.value;
  req.body.identifierKind = classified.kind;
  // Keep req.body.email populated for legacy downstream readers; for phone
  // logins it carries the normalized phone so lookups still resolve.
  req.body.email = classified.value;
  next();
};

module.exports = validateLogin;
