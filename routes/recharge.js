// routes/recharge.js
const express = require("express");
const router = express.Router();
const rechargeController = require("../controllers/rechargeController");
const { verifyToken } = require("../middleware/auth"); 

router.post("/create", verifyToken, rechargeController.createRecharge);

router.post("/webhook", rechargeController.payosWebhook);

router.get("/status/:orderCode", verifyToken, rechargeController.checkStatus);

module.exports = router;