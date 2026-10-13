const rateLimit = require("express-rate-limit");
const AppError = require("../utils/AppError");

const tooManyRequests = (message) => (req, res, next) => {
  next(new AppError(message, 429));
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  limit: 100,              
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests("Too many requests. Please try again later"),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,              
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests("Too many attempts. Please try again after 15 minutes"),
});

module.exports = { apiLimiter, authLimiter };