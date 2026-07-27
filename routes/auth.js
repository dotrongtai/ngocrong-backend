const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, validateRegister } = require('../middleware/auth');

router.post('/register', validateRegister, authController.register);

router.post('/login', authController.login);

router.post('/change-password', verifyToken, authController.changePassword);

router.get('/profile', verifyToken, authController.getProfile);

module.exports = router;