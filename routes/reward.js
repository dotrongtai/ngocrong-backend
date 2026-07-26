// routes/reward.js
const express = require('express');
const router = express.Router();
const rewardController = require('../controllers/rewardController');
const { verifyToken } = require('../middleware/auth');

// 📊 Trạng thái vòng quay: số lượt đã quay, chi phí lượt kế tiếp, số hồng ngọc hiện có
router.get('/status', verifyToken, rewardController.getStatus);

// 🎲 Quay - server tự chọn phần thưởng + trừ hồng ngọc, KHÔNG nhận itemId/wheelIndex từ client nữa
router.post('/spin', verifyToken, rewardController.spin);

// 📜 Lấy danh sách quà chưa nhận
router.get('/unclaimed', verifyToken, rewardController.getUnclaimedRewards);

// 📜 Lấy toàn bộ lịch sử (claimed + unclaimed)
router.get('/history', verifyToken, rewardController.getHistory);

// 🎁 Nhận vào game
router.post('/claim', verifyToken, rewardController.claimReward);

module.exports = router;