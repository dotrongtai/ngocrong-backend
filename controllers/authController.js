const jwt = require('jsonwebtoken');
const pool = require('../config/database');
exports.register = async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;

    if (!username || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin'
      });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Username phải từ 3-20 ký tự'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password phải từ 6 ký tự trở lên'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password không khớp'
      });
    }

    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      'SELECT * FROM account WHERE username = ?',
      [username]
    );

    if (rows.length > 0) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'Tên đăng nhập đã tồn tại'
      });
    }

    await conn.query(
      'INSERT INTO account (username, password, create_time) VALUES (?, ?, NOW())',
      [username, password] 
    );

    conn.release();

    return res.status(201).json({
      success: true,
      message: 'Đăng ký thành công!'
    });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập username và password'
      });
    }

    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      'SELECT * FROM account WHERE username = ?',
      [username]
    );

    conn.release();

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Tên đăng nhập không tồn tại'
      });
    }

    const user = rows[0];

    if (password !== user.password) { 
      return res.status(401).json({
        success: false,
        message: 'Password không chính xác'
      });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công!',
      token: token,
      user: {
        id: user.id,
        username: user.username
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      'SELECT id, username, create_time, vnd, tongnap FROM account WHERE id = ?',
      [userId]
    );
    conn.release();

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Người dùng không tồn tại'
      });
    }

    return res.status(200).json({
      success: true,
      user: rows[0]
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
};