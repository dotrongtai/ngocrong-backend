const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Không có token, vui lòng đăng nhập'
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: 'Token không hợp lệ hoặc hết hạn'
        });
      }

      req.user = user;
      next();
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực: ' + error.message
    });
  }
};

exports.validateRegister = (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username và password bắt buộc'
    });
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Định dạng dữ liệu không hợp lệ'
    });
  }

  next();
};