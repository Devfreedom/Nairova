const express = require("express");
const {register, login} = require("../controllers/authControllers");
const validateRegister = require("../middleware/validateRegister");
const validateLogin = require("../middleware/validateLogin");
const authenticate = require("../middleware/authenticate")
const {authLimiter} = require("../middleware/rateLimiter");
const {getBalance} = require("../controllers/accountControllers")
const { findUserById } = require("../db/store");
const router = express.Router();

router.post("/register", authLimiter, validateRegister, register);
router.post("/login", authLimiter, validateLogin, login);

// temporary route for test
router.get("/me", authenticate, async (req, res, next) => {
    try {
        const user = await findUserById(req.user.id);
        if (!user) {
            return res.status(401).json({ success: false, message: "User no longer exists" });
        }
        const { passwordHash, pinHash, createdAt, accountId, currency, ...safe } = user;
        res.status(200).json({success: true, data: safe});
    } catch (err) {
        next(err);
    }
});

router.get('/balance', authenticate, getBalance);

module.exports = router;
