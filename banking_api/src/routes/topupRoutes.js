const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/authMiddleware");
const { getTopupCatalogue } = require("../controllers/topupControllers");

router.get("/catalogue", authenticate, getTopupCatalogue);

module.exports = router;
