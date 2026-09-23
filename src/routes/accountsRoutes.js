const express = require('express');
const router = express.Router();

const authenticate  = require('../middleware/authMiddleware');
const { getBalance } = require('../controllers/accountControllers');

router.get('/balance', authenticate, getBalance);

module.exports = router;