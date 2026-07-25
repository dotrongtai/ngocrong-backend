const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, validateRegister } = require('../middleware/auth');

// 📝 ĐĂNG KÝ
router.post('/register', validateRegister, authController.register);

// 🔑 ĐĂNG NHẬP
router.post('/login', authController.login);

// 👤 LẤY THÔNG TIN USER (cần token)
router.get('/profile', verifyToken, authController.getProfile);

module.exports = router;