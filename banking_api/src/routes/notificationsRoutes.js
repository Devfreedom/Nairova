const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/authMiddleware");
const { list, count, markOne, markAll } = require("../controllers/notificationControllers");

router.get("/", authenticate, list);
router.get("/unread-count", authenticate, count);
router.patch("/read-all", authenticate, markAll);
router.patch("/:id/read", authenticate, markOne);

module.exports = router;
