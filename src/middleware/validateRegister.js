const AppError = require("../utils/AppError");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
const ALLOWED_ROLES = ["admin", "user"];

const validateRegister = (req, res, next) => {
  const { name, email, password, role } = req.body || {};
  const errors = [];

  if (typeof name !== "string" || name.trim() === "") {
    errors.push("Name is required");
  }

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    errors.push("A valid email is required");
  }

  if (typeof password !== "string" || !PASSWORD_REGEX.test(password)) {
    errors.push(
      "Password must be at least 6 characters and include an uppercase letter, a lowercase letter, a number and a special character"
    );
  }

  if (!ALLOWED_ROLES.includes(role)) {
    errors.push("Role must be either 'admin' or 'user'");
  }

  if (errors.length > 0) {
    return next(new AppError("Validation failed", 400, errors));
  }

  //this clean the data before the controller uses it
  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();

  next();
};

module.exports = validateRegister;