// Shared password-strength rule so registration and admin-assisted resets
// enforce identical requirements.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
const PASSWORD_REQUIREMENTS =
  "Password must be at least 6 characters and include an uppercase letter, a lowercase letter, a number and a special character";

function validatePassword(password) {
  return typeof password === "string" && PASSWORD_REGEX.test(password);
}

module.exports = { PASSWORD_REGEX, PASSWORD_REQUIREMENTS, validatePassword };
