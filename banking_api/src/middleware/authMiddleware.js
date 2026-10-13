const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { findUserById } = require('../db/store');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Please provide a token', 401));
  }

  const token = authHeader.split(' ')[1];
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    return next(new AppError('Server misconfigured: authentication unavailable', 500));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Identity and role are loaded from the database so stale token claims
    // cannot grant outdated privileges.
    const user = await findUserById(decoded.id);
    if (!user) {
      return next(new AppError('User no longer exists', 401));
    }
    req.user = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, accountNumber: user.accountNumber };
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError('Invalid or expired token', 401));
  }
};

const authorize = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next(new AppError('Access denied. Admins only.', 403));
  }
  next();
};

module.exports = { authenticate, authorize };
