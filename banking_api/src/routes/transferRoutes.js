const express = require('express');
const router = express.Router();

const {authenticate}  = require('../middleware/authMiddleware');
const { transfer } = require('../controllers/transferControllers');
const { getTransactions } = require('../controllers/accountControllers');

router.post('/', authenticate, transfer);
router.get('/history', authenticate, getTransactions);

module.exports = router;
