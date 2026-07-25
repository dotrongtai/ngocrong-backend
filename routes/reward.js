// routes/reward.js
const express = require('express');
const router = express.Router();
const rewardController = require('../controllers/rewardController');
const { verifyToken } = require('../middleware/auth');

// 🎲 Quay - tạo reward
router.post('/spin', verifyToken, rewardController.spin);

// 📜 Lấy danh sách quà chưa nhận
router.get('/unclaimed', verifyToken, rewardController.getUnclaimedRewards);

// 🎁 Nhận vào game
router.post('/claim', verifyToken, rewardController.claimReward);

module.exports = router;