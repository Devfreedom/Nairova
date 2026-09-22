const express = require("express");
const helmet = require("helmet");
const cors = require("cors")
// const logger = require("./middleware/logger");
// const {apiLimiter} = require("./middleware/rateLimiter");
const errorHandler = require("./src/middleware/errorHandler")
const AppError = require("./src/utils/AppError");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({limit: "10kb"}));
// app.use(logger);
// app.use(apiLimiter);

app.get("/", (req, res) => {
    res.status(200).json({success: true, message: "API is running"})
})

app.use((req, res, next) => {
    next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

app.use(errorHandler);

module.exports = app