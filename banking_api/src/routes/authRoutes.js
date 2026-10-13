const express = require("express");
const {register, login} = require("../controllers/authControllers");
const validateRegister = require("../middleware/validateRegister");
const validateLogin = require("../middleware/validateLogin");
const authenticate = require("../middleware/authenticate")
const {authLimiter} = require("../middleware/rateLimiter");
const {getBalance} = require("../controllers/accountControllers")
const router = express.Router();

router.post("/register", authLimiter, validateRegister, register);
router.post("/login", authLimiter, validateLogin, login);

// temporary route for test 
router.get("/me", authenticate, (req, res) => {
    const { password, pin, ...safe } = require("../data/users").users.find((u) => u.id === req.user.id) || req.user;
    res.status(200).json({success: true, data: safe});
});

router.get('/balance', authenticate, getBalance);

module.exports = router;
