const express = require("express");
const {register, login} = require("../controllers/authControllers");
const validateRegister = require("../middleware/validateRegister");
const validateLogin = require("../middleware/validateLogin");
const authenticate = require("../middleware/authenticate")
const {authLimiter} = require("../middleware/rateLimiter");
const {getBalance} = require("../controllers/accountControllers")
const { findUserById } = require("../db/store");
const { getPreferences } = require("../db/store");
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
        // Additive Phase 6 fields: verification state and preferences travel
        // with the session profile so Settings renders without extra calls.
        const preferences = await getPreferences(req.user.id);
        res.status(200).json({
          success: true,
          data: { ...safe, emailVerified: user.emailVerified === true, preferences },
        });
    } catch (err) {
        next(err);
    }
});

router.get('/balance', authenticate, getBalance);

module.exports = router;
