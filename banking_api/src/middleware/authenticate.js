const jwt = require("jsonwebtoken");
const { findUserById } = require("../db/store");
const AppError = require("../utils/AppError");

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError("Authentication required. Please provide a token", 401));
  }

  const token = authHeader.split(" ")[1];
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    return next(new AppError("Server misconfigured: authentication unavailable", 500));
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    // Identity and role are loaded from the database so stale token claims
    // cannot grant outdated privileges.
    const user = await findUserById(decoded.id);
    if (!user) {
      return next(new AppError("User no longer exists", 401));
    }

    req.user = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, accountNumber: user.accountNumber };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError("Invalid or expired token", 401));
  }
};


module.exports = authenticate;
