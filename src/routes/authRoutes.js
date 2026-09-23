const express = require("express");
const {register, login} = require("../controllers/authControllers");
const validateRegister = require("../middleware/validateRegister");
const validateLogin = require("../middleware/validateLogin");
const authenticate = require("../middleware/authenticate")
const {authLimiter} = require("../middleware/rateLimiter");

const router = express.Router();

router.post("/register", authLimiter, validateRegister, register);
router.post("/login", authLimiter, validateLogin, login);

// temporary route for test 
router.get("/me", authenticate, (req, res) => {
    res.status(200).json({success: true, data: req.user});
});

module.exports = router;