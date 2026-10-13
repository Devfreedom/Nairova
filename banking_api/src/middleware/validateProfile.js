const AppError = require("../utils/AppError");
const { classifyIdentifier } = require("../utils/identifier");

// PATCH /api/account/profile. Every field is optional but at least one is
// required. Email/phone reuse registration's canonical validation; an empty
// string clears the field (the controller keeps at least one identifier).
// Canonical values are stashed for the controller; raw input is not echoed.
const validateProfile = (req, res, next) => {
  const { name, email, phone } = req.body || {};
  if (name === undefined && email === undefined && phone === undefined) {
    return next(new AppError("Provide at least one of name, email, or phone", 400));
  }
  const errors = [];
  const patch = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      errors.push("Name must be at least 2 characters");
    } else {
      patch.name = name.trim();
    }
  }

  for (const [label, value, kind] of [["email", email, "email"], ["phone", phone, "phone"]]) {
    if (value === undefined) continue;
    if (value === "") {
      patch[label] = null;
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`${label === "email" ? "Email" : "Phone number"} must be text`);
      continue;
    }
    const classified = classifyIdentifier(value);
    if (!classified.ok || classified.kind !== kind) {
      errors.push(
        kind === "email"
          ? "Enter a valid email address"
          : "Enter a valid Nigerian phone number (e.g. 08012345678)"
      );
    } else {
      patch[label] = classified.value;
    }
  }

  if (errors.length > 0) {
    return next(new AppError("Validation failed", 400, errors));
  }
  req.profilePatch = patch;
  next();
};

module.exports = validateProfile;
