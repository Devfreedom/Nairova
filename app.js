const express = require("express");
const helmet = require("helmet");
const cors = require("cors")
// const logger = require("./middleware/logger");
// const {apiLimiter} = require("./middleware/rateLimiter");


const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({limit: "10kb"}));
// app.use(logger);
// app.use(apiLimiter);

app.get("/", (req, res) => {
    res.status(200).json({success: true, message: "API is running"})
})

module.exports = app