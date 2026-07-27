// routes/reward.js
const express = require('express');
const router = express.Router();
const rewardController = require('../controllers/rewardController');
const { verifyToken } = require('../middleware/auth');

router.get('/status', verifyToken, rewardController.getStatus);

router.post('/spin', verifyToken, rewardController.spin);

router.get('/unclaimed', verifyToken, rewardController.getUnclaimedRewards);

router.get('/history', verifyToken, rewardController.getHistory);

router.post('/claim', verifyToken, rewardController.claimReward);

module.exports = router;