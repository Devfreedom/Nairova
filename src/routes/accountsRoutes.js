const express = require('express');
const router = express.Router();

const authenticate  = require('../middleware/authMiddleware');
const { getBalance, createPin } = require('../controllers/accountControllers');

router.get('/balance', authenticate, getBalance);
router.post('/pin/create', authenticate, createPin);

module.exports = router;