const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reward', require('./routes/reward'));
app.use('/api/recharge', require('./routes/recharge'));
app.use("/api/event", require("./routes/event"));
app.get('/', (req, res) => {
  res.json({
    message: '🐉 Welcome to Ngoc Rong Game API!',
    version: '1.0.0',
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      profile: 'GET /api/auth/profile (cần token)'
    }
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint không tồn tại'
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  🐉 TÀI ĐẸP TRAI SERVER         ║
║  ✅ Running on port ${PORT}     ║
║  🌍 http://localhost:${PORT}      ║
╚════════════════════════════════════╝
  `);
});