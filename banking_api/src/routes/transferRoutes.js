const express = require('express');
const router = express.Router();

const {authenticate}  = require('../middleware/authMiddleware');
const { transfer } = require('../controllers/transferControllers');

router.post('/', authenticate, transfer);

module.exports = router;