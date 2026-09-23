const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const logger = require("./src/middleware/logger");
const {apiLimiter} = require("./src/middleware/rateLimiter");
const authRoutes = require("./src/routes/authRoutes")
const errorHandler = require("./src/middleware/errorHandler")
const AppError = require("./src/utils/AppError");

const app = express();

app.use(helmet());
app.use(cors());
app.use(logger);
app.use(apiLimiter);
app.use(express.json({limit: "10kb"}));

app.get("/", (req, res) => {
    res.status(200).json({success: true, message: "API is running"})
})

app.use("/api/auth", authRoutes);

app.use((req, res, next) => {
    next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

app.use((err, req, res, next) => {
     console.error(err); // ← is this line there?
     res.status(500).json({ success: false, message: 'Something went wrong' });
   });

   app.use((err, req, res, next) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Something went wrong',
  });
});

app.use(errorHandler);

module.exports = app