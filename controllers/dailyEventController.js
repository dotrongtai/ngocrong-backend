// controllers/dailyEventController.js
const pool = require("../config/database");
const event = require("../services/dailyRechargeEvent");

/** GET /api/event/daily7  — tiến độ của user đang đăng nhập */
exports.getStatus = async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const data = await event.getStatus(conn, req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Daily7 getStatus Error:", error);
    return res.status(500).json({
      success: false,
      message: "Không tải được tiến độ sự kiện.",
    });
  } finally {
    if (conn) conn.release();
  }
};

/** POST /api/event/daily7/claim — nhận 15.000 khi đã đủ 7 viên */
exports.claim = async (req, res) => {
  try {
    const result = await event.claimReward(pool, req.user.id);
    return res.status(200).json({
      success: true,
      message: `Đã nhận ${result.rewardVnd.toLocaleString("vi-VN")} VNĐ.`,
      data: result,
    });
  } catch (error) {
    if (error instanceof event.EventError) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    console.error("Daily7 claim Error:", error);
    return res.status(500).json({
      success: false,
      message: "Không nhận được thưởng, thử lại sau.",
    });
  }
};