const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/authMiddleware");
const { getTopupCatalogue, purchaseAirtime } = require("../controllers/topupControllers");

router.get("/catalogue", authenticate, getTopupCatalogue);
router.post("/airtime", authenticate, purchaseAirtime);

module.exports = router;
