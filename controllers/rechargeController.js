// controllers/rechargeController.js
const payOS = require("../config/payos");
const pool = require("../config/database");

// ============ MỐC THƯỞNG NẠP TIỀN ============
// Trả về % thưởng dựa theo số tiền nạp (kiểm tra từ mốc cao xuống thấp)
function getBonusPercent(amount) {
  if (amount >= 500000) return 20;
  if (amount >= 200000) return 15;
  if (amount >= 100000) return 10;
  return 0;
}

// ============ TẠO LINK/QR THANH TOÁN ============
// POST /api/recharge/create
// Body: { amount: 10000 }  (số tiền VNĐ muốn nạp)
exports.createRecharge = async (req, res) => {
  try {
    const userId = req.user.id; // lấy từ middleware xác thực token (giống getProfile)
    const { amount } = req.body;

    if (!amount || amount < 10000) {
      return res.status(400).json({
        success: false,
        message: "Số tiền nạp tối thiểu là 10.000 VNĐ",
      });
    }

    const bonusPercent = getBonusPercent(amount);
    const vndCredit = amount + Math.round((amount * bonusPercent) / 100);

    // orderCode phải là số nguyên, không trùng lặp -> dùng timestamp
    const orderCode = Number(String(Date.now()).slice(-9));

    const conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO recharge_transactions (user_id, order_code, amount, bonus_percent, vnd_credit, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [userId, orderCode, amount, bonusPercent, vndCredit]
    );
    conn.release();

    const paymentData = {
      orderCode: orderCode,
      amount: amount,
      description: `Nap tien NRO ${orderCode}`, // PayOS giới hạn description ngắn, không dấu
      returnUrl: "https://ngocrong-frontend.pages.dev/topup.html",
      cancelUrl: "https://ngocrong-frontend.pages.dev/topup.html",
    };

    const paymentLink = await payOS.paymentRequests.create(paymentData);

    return res.status(200).json({
      success: true,
      checkoutUrl: paymentLink.checkoutUrl,
      qrCode: paymentLink.qrCode,
      orderCode: orderCode,
      bonusPercent: bonusPercent,
      vndCredit: vndCredit,
    });
  } catch (error) {
    console.error("Create Recharge Error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi tạo giao dịch: " + error.message,
    });
  }
};

// ============ NHẬN WEBHOOK TỪ PAYOS ============
// POST /api/recharge/webhook
// PayOS sẽ tự gọi vào URL này khi có giao dịch thành công.
// KHÔNG cần token vì đây là server-to-server, thay vào đó xác thực bằng chữ ký (signature).
exports.payosWebhook = async (req, res) => {
  try {
    const webhookData = await payOS.webhooks.verify(req.body);
    // Nếu verify() không throw lỗi -> chữ ký hợp lệ, đúng là PayOS gọi tới
    // Lưu ý: verify() trả về TRỰC TIẾP dữ liệu giao dịch, không bọc trong .data

    const { orderCode, amount } = webhookData;

    const conn = await pool.getConnection();

    // Tìm giao dịch tương ứng, đảm bảo còn đang "pending" (tránh cộng tiền 2 lần)
    const [rows] = await conn.query(
      `SELECT * FROM recharge_transactions WHERE order_code = ? AND status = 'pending'`,
      [orderCode]
    );

    if (rows.length === 0) {
      conn.release();
      // Không tìm thấy hoặc đã xử lý rồi -> vẫn trả 200 để PayOS không gửi lại webhook liên tục
      return res.status(200).json({ message: "Giao dịch không tồn tại hoặc đã xử lý" });
    }

    const transaction = rows[0];

    // Đối chiếu số tiền thực nhận với số tiền đã tạo lúc đầu, tránh gian lận sửa amount
    if (Number(amount) !== Number(transaction.amount)) {
      conn.release();
      console.error(`Số tiền không khớp cho order ${orderCode}: nhận ${amount}, kỳ vọng ${transaction.amount}`);
      return res.status(200).json({ message: "Số tiền không khớp" });
    }

    // Cộng tiền vào tài khoản: vnd += vnd_credit (đã gồm % thưởng), tongnap += amount thực nạp
    await conn.query(
      `UPDATE account SET vnd = vnd + ?, tongnap = tongnap + ? WHERE id = ?`,
      [transaction.vnd_credit, amount, transaction.user_id]
    );

    // Đánh dấu giao dịch đã hoàn tất
    await conn.query(
      `UPDATE recharge_transactions SET status = 'success', updated_at = NOW() WHERE id = ?`,
      [transaction.id]
    );

    conn.release();

    return res.status(200).json({ message: "OK" });
  } catch (error) {
    console.error("Webhook Error:", error);
    // Luôn trả 200 kể cả lỗi để tránh PayOS retry vô hạn nếu lỗi phía mình,
    // nhưng vẫn log lại đầy đủ để tự kiểm tra
    return res.status(200).json({ message: "Lỗi xử lý, đã ghi log" });
  }
};

// ============ KIỂM TRA TRẠNG THÁI GIAO DỊCH (để frontend polling) ============
// GET /api/recharge/status/:orderCode
exports.checkStatus = async (req, res) => {
  try {
    const { orderCode } = req.params;
    const conn = await pool.getConnection();
    const [rows] = await conn.query(
      `SELECT status FROM recharge_transactions WHERE order_code = ?`,
      [orderCode]
    );
    conn.release();

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch" });
    }

    return res.status(200).json({ success: true, status: rows[0].status });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi server: " + error.message });
  }
};