const payOS = require("../config/payos");
const pool = require("../config/database");
const event = require("../services/dailyRechargeEvent");

function getBonusPercent(amount) {
  if (amount >= 500000) return 20;
  if (amount >= 200000) return 15;
  if (amount >= 100000) return 10;
  return 0;
}

exports.createRecharge = async (req, res) => {
  let conn;
  try {
    const userId = req.user.id;
    const money = Number(req.body.amount);

    if (!Number.isInteger(money) || money < 10000) {
      return res.status(400).json({
        success: false,
        message: "Số tiền nạp tối thiểu là 10.000 VNĐ",
      });
    }

    const bonusPercent = getBonusPercent(money);
    const vndCredit = money + Math.round((money * bonusPercent) / 100);
    const orderCode = Number(String(Date.now()).slice(-9));

    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO recharge_transactions
         (user_id, order_code, amount, bonus_percent, vnd_credit, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [userId, orderCode, money, bonusPercent, vndCredit]
    );

    const paymentLink = await payOS.paymentRequests.create({
      orderCode,
      amount: money,
      description: `Nap tien NRO ${orderCode}`,
      returnUrl: "https://ngocrong-frontend.pages.dev/topup.html",
      cancelUrl: "https://ngocrong-frontend.pages.dev/topup.html",
    });

    return res.status(200).json({
      success: true,
      checkoutUrl: paymentLink.checkoutUrl,
      qrCode: paymentLink.qrCode,
      orderCode,
      bonusPercent,
      vndCredit,
    });
  } catch (error) {
    console.error("Create Recharge Error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi tạo giao dịch: " + error.message,
    });
  } finally {

    if (conn) conn.release();
  }
};

exports.payosWebhook = async (req, res) => {
  let conn;
  try {
    const webhookData = await payOS.webhooks.verify(req.body);
    const { orderCode, amount } = webhookData;

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT * FROM recharge_transactions
        WHERE order_code = ? AND status = 'pending'
          FOR UPDATE`,
      [orderCode]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res
        .status(200)
        .json({ message: "Giao dịch không tồn tại hoặc đã xử lý" });
    }

    const transaction = rows[0];

    if (Number(amount) !== Number(transaction.amount)) {
      await conn.rollback();
      console.error(
        `Số tiền không khớp cho order ${orderCode}: nhận ${amount}, kỳ vọng ${transaction.amount}`
      );
      return res.status(200).json({ message: "Số tiền không khớp" });
    }

    const eventResult = await event.applyRecharge(conn, transaction.user_id, {
      transactionId: transaction.id,

      paidAmount: transaction.amount,
    });

    await conn.query(
      `UPDATE account SET vnd = vnd + ?, tongnap = tongnap + ? WHERE id = ?`,
      [transaction.vnd_credit, transaction.amount, transaction.user_id]
    );

    await conn.query(
      `UPDATE recharge_transactions
          SET status = 'success', updated_at = NOW()
        WHERE id = ?`,
      [transaction.id]
    );

    await conn.commit();

    console.log(
      `Order ${orderCode} OK - user ${transaction.user_id} - daily7:`,
      eventResult
    );
    return res.status(200).json({ message: "OK" });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    console.error("Webhook Error:", error);
    return res.status(200).json({ message: "Lỗi xử lý, đã ghi log" });
  } finally {
    if (conn) conn.release();
  }
};

exports.checkStatus = async (req, res) => {
  let conn;
  try {
    const { orderCode } = req.params;
    conn = await pool.getConnection();
    const [rows] = await conn.query(
      `SELECT status FROM recharge_transactions WHERE order_code = ?`,
      [orderCode]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy giao dịch" });
    }

    return res.status(200).json({ success: true, status: rows[0].status });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Lỗi server: " + error.message });
  } finally {
    if (conn) conn.release();
  }
};