const logger = (req, res, next) => {
  res.on("finish", () => {
    const time = new Date().toLocaleTimeString("en-GB"); // 19:32:10
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${time}`);
  });

  next();
};

module.exports = logger;