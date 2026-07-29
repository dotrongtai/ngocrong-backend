const express = require("express");
const router = express.Router();
const eventController = require("../controllers/dailyEventController");
const { verifyToken } = require("../middleware/auth");

router.get("/daily7", verifyToken, eventController.getStatus);
router.post("/daily7/claim", verifyToken, eventController.claim);

module.exports = router;

// Trong app.js / server.js, cạnh dòng mount recharge:
//  