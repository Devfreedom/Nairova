const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/authMiddleware');
const { listCustomers, creditAccount } = require('../controllers/adminControllers');
const { getTransactions } = require('../controllers/accountControllers');

router.get('/users', authenticate, authorize, listCustomers);
router.post('/credit', authenticate, authorize, creditAccount);
router.get('/transactions', authenticate, authorize, getTransactions);

module.exports = router;
