const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const logger = require("./src/middleware/logger");
const {apiLimiter} = require("./src/middleware/rateLimiter");
const authRoutes = require("./src/routes/authRoutes");
const accountRoutes = require("./src/routes/accountsRoutes");
const transferRoutes = require("./src/routes/transferRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const errorHandler = require("./src/middleware/errorHandler")
const AppError = require("./src/utils/AppError");

const app = express();

app.use(helmet());
// Explicit CORS: restrict to the configured frontend origin in production,
// allow common Vite dev origins by default. Never use "*" with credentials.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
  credentials: false,
  // Let the browser read rate-limit headers so the UI can show wait times.
  exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "RateLimit-Policy"],
}));
app.use(logger);
app.use(apiLimiter);
app.use(express.json({limit: "10kb"}));

app.get("/", (req, res) => {
    res.status(200).json({success: true, message: "API is running"})
})

app.use("/api/auth", authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res, next) => {
    next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// Single shared error handler so status codes and JSON shape stay consistent.
app.use(errorHandler);

module.exports = app
