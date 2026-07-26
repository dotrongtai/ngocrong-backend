// routes/recharge.js
const express = require("express");
const router = express.Router();
const rechargeController = require("../controllers/rechargeController");
const { verifyToken } = require("../middleware/auth"); // đúng theo middleware/auth.js hiện có

// Cần đăng nhập mới tạo được giao dịch nạp tiền
router.post("/create", verifyToken, rechargeController.createRecharge);

// Webhook: KHÔNG dùng verifyToken vì đây là PayOS gọi vào, không có token người dùng
router.post("/webhook", rechargeController.payosWebhook);

// Kiểm tra trạng thái (frontend gọi định kỳ để biết đã cộng tiền chưa)
router.get("/status/:orderCode", verifyToken, rechargeController.checkStatus);

module.exports = router;