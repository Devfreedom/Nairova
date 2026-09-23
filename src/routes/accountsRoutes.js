const express = require('express');
const router = express.Router();

const authenticate  = require('../middleware/authMiddleware');
const { getBalance, createPin, updatePin, deposit } = require('../controllers/accountControllers');

router.get('/balance', authenticate, getBalance);
router.post('/pin/create', authenticate, createPin);
router.put('/pin/update', authenticate, updatePin);
router.post('/deposit', authenticate, deposit)

module.exports = router;