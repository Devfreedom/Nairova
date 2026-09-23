const express = require('express');
const router = express.Router();

const {authenticate, authorize}  = require('../middleware/authMiddleware');
const { getBalance, createPin, updatePin, deposit, verifyAccount, getAllUsers } = require('../controllers/accountControllers');

router.get('/balance', authenticate, authorize, getBalance);
router.post('/pin/create', authenticate, createPin);
router.put('/pin/update', authenticate, updatePin);
router.post('/deposit', authenticate, deposit)
router.post('/verify/:accountNumber', authenticate, verifyAccount);
router.get('/users', authenticate, authorize, getAllUsers);

module.exports = router;