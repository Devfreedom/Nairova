const AppError = require("../utils/AppError");

// POST /api/account/email/verify. Tokens are 32 random bytes hex-encoded.
// Shape-checked before hashing so malformed input fails fast.
const validateEmailVerify = (req, res, next) => {
  const { token } = req.body || {};
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/i.test(token.trim())) {
    return next(new AppError("A valid verification token is required", 400));
  }
  req.body.token = token.trim();
  next();
};

module.exports = validateEmailVerify;
