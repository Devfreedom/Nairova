const AppError = require("../utils/AppError");
const { PASSWORD_REGEX, PASSWORD_REQUIREMENTS } = require("../utils/password");
const { classifyIdentifier } = require("../utils/identifier");

const validateRegister = (req, res, next) => {
  const { name, email, identifier, phone, password, pin, pinConfirm } = req.body || {};
  const errors = [];

  if (typeof name !== "string" || name.trim() === "") {
    errors.push("Name is required");
  }

  // Accept { identifier } (email or phone) plus legacy { email }.
  const rawIdentifier =
    typeof identifier === "string" && identifier.trim() !== ""
      ? identifier
      : typeof email === "string" && email.trim() !== ""
        ? email
        : typeof phone === "string" && phone.trim() !== ""
          ? phone
          : "";
  const classified = classifyIdentifier(rawIdentifier);
  if (!classified.ok) {
    errors.push(classified.error);
  }

  if (typeof password !== "string" || !PASSWORD_REGEX.test(password)) {
    errors.push(PASSWORD_REQUIREMENTS);
  }

  // Mandatory transaction PIN: exactly 4 digits, entered twice identically.
  // Only the field names appear in errors; the values are never echoed.
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    errors.push("Transaction PIN must be exactly 4 digits");
  }
  if (typeof pinConfirm !== "string" || !/^\d{4}$/.test(pinConfirm)) {
    errors.push("Transaction PIN confirmation must be exactly 4 digits");
  } else if (typeof pin === "string" && /^\d{4}$/.test(pin) && pinConfirm !== pin) {
    errors.push("Transaction PIN confirmation does not match");
  }

  // NOTE: public registration never accepts a client-supplied role.
  // All public signups create ordinary users; admins are provisioned
  // server-side via the ADMIN_* environment bootstrap.

  if (errors.length > 0) {
    return next(new AppError("Validation failed", 400, errors));
  }

  //this clean the data before the controller uses it
  req.body.name = name.trim();
  req.body.email = classified.kind === "email" ? classified.value : null;
  req.body.phone = classified.kind === "phone" ? classified.value : null;
  req.body.pin = pin;

  next();
};

module.exports = validateRegister;
