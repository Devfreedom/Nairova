const express = require('express');
const router = express.Router();

const {authenticate, authorize}  = require('../middleware/authMiddleware');
const {authLimiter} = require('../middleware/rateLimiter');
const { getBalance, createPin, updatePin, deposit, verifyAccount, getAllUsers, getTransactions } = require('../controllers/accountControllers');
const settings = require('../controllers/settingsControllers');
const validateProfile = require('../middleware/validateProfile');
const validatePreferences = require('../middleware/validatePreferences');
const validatePasswordChange = require('../middleware/validatePasswordChange');
const validateEmailVerify = require('../middleware/validateEmailVerify');

router.get('/balance', authenticate, getBalance);
router.post('/pin/create', authenticate, createPin);
router.put('/pin/update', authenticate, updatePin);
router.post('/deposit', authenticate, deposit)
router.post('/verify/:accountNumber', authenticate, verifyAccount);
router.get('/transactions', authenticate, getTransactions);
// Settings and account preferences (Phase 6). Profile and preference edits
// are owner-scoped by the session; token/password operations are rate-limited.
router.patch('/profile', authenticate, validateProfile, settings.patchProfile);
router.post('/email/request', authenticate, authLimiter, settings.requestEmailVerification);
router.post('/email/verify', authenticate, authLimiter, validateEmailVerify, settings.verifyEmail);
router.get('/preferences', authenticate, settings.getPrefs);
router.patch('/preferences', authenticate, validatePreferences, settings.patchPrefs);
router.put('/password', authenticate, authLimiter, validatePasswordChange, settings.changePassword);
// Legacy admin listing kept for compatibility; sanitized and admin-only.
router.get('/users', authenticate, authorize, getAllUsers);

module.exports = router;
