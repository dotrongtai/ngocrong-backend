

const EVENT_CODE = "daily7";
const SCHEDULE = [10000, 10000, 10000, 10000, 15000, 10000, 20000];
const TOTAL_DAYS = SCHEDULE.length;
const REWARD_VND = 15000;

class EventError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}


function vnToday(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function requiredFor(dayIndex) {
  return SCHEDULE[dayIndex - 1] ?? null;
}

/**
 * Ghi nhận một lần nạp thành công vào sự kiện.
 * PHẢI được gọi bên trong transaction của webhook, sau khi đã cộng vnd/tongnap.
 *
 * @param {*} conn        connection đang mở transaction
 * @param {number} userId
 * @param {{transactionId:number, paidAmount:number}} txn
 *        paidAmount là TIỀN THẬT user chuyển (recharge_transactions.amount),
 *        không phải vnd_credit — nếu dùng vnd_credit thì user nạp 100k được
 *        bonus 10% sẽ ăn gian được mốc 20k của ngày 7.
 * @returns {Promise<object>} kết quả để ghi log, không dùng để trả về client
 */
async function applyRecharge(conn, userId, { transactionId, paidAmount }) {
  const today = vnToday();
  const amount = Number(paidAmount);


  await conn.query(
    `INSERT IGNORE INTO daily_recharge_progress (user_id) VALUES (?)`,
    [userId]
  );
  const [pRows] = await conn.query(
    `SELECT current_day, reward_claimed,
            DATE_FORMAT(last_day_date, '%Y-%m-%d') AS last_day_date
       FROM daily_recharge_progress
      WHERE user_id = ?
        FOR UPDATE`,
    [userId]
  );
  const progress = pRows[0];

  if (progress.current_day >= TOTAL_DAYS) {
    return { counted: false, reason: "event_completed" };
  }

  if (progress.last_day_date === today) {
    return { counted: false, reason: "already_collected_today" };
  }

  try {
    await conn.query(
      `INSERT INTO daily_recharge_txn (transaction_id, user_id, log_date, amount)
       VALUES (?, ?, ?, ?)`,
      [transactionId, userId, today, amount]
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return { counted: false, reason: "duplicate_transaction" };
    }
    throw err;
  }

  const dayIndex = progress.current_day + 1;
  const required = requiredFor(dayIndex);

  await conn.query(
    `INSERT INTO daily_recharge_daily
       (user_id, log_date, day_index, required_amount, paid_amount)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE paid_amount = paid_amount + ?`,
    [userId, today, dayIndex, required, amount, amount]
  );

  const [dRows] = await conn.query(
    `SELECT paid_amount, required_amount, day_index
       FROM daily_recharge_daily
      WHERE user_id = ? AND log_date = ?`,
    [userId, today]
  );
  const day = dRows[0];

  if (Number(day.paid_amount) < Number(day.required_amount)) {
    return {
      counted: false,
      reason: "not_enough_yet",
      dayIndex: day.day_index,
      paid: Number(day.paid_amount),
      required: Number(day.required_amount),
      remaining: Number(day.required_amount) - Number(day.paid_amount),
    };
  }

  await conn.query(
    `UPDATE daily_recharge_daily
        SET completed = 1, completed_at = NOW()
      WHERE user_id = ? AND log_date = ?`,
    [userId, today]
  );
  await conn.query(
    `UPDATE daily_recharge_progress
        SET current_day    = ?,
            last_day_date  = ?,
            start_date     = COALESCE(start_date, ?)
      WHERE user_id = ?`,
    [day.day_index, today, today, userId]
  );

  return {
    counted: true,
    dayIndex: day.day_index,
    paid: Number(day.paid_amount),
    required: Number(day.required_amount),
    allDaysDone: day.day_index >= TOTAL_DAYS,
  };
}


async function getStatus(conn, userId) {
  const today = vnToday();

  const [pRows] = await conn.query(
    `SELECT current_day, reward_claimed,
            DATE_FORMAT(start_date,    '%Y-%m-%d') AS start_date,
            DATE_FORMAT(last_day_date, '%Y-%m-%d') AS last_day_date
       FROM daily_recharge_progress
      WHERE user_id = ?`,
    [userId]
  );
  const progress = pRows[0] || {
    current_day: 0,
    reward_claimed: 0,
    start_date: null,
    last_day_date: null,
  };

  const [doneRows] = await conn.query(
    `SELECT day_index, paid_amount, required_amount,
            DATE_FORMAT(log_date, '%Y-%m-%d') AS log_date
       FROM daily_recharge_daily
      WHERE user_id = ? AND completed = 1
      ORDER BY day_index`,
    [userId]
  );
  const doneByDay = new Map(doneRows.map((r) => [Number(r.day_index), r]));

  const [todayRows] = await conn.query(
    `SELECT day_index, paid_amount, required_amount, completed
       FROM daily_recharge_daily
      WHERE user_id = ? AND log_date = ?`,
    [userId, today]
  );
  const todayRow = todayRows[0] || null;

  const currentDay = Number(progress.current_day);
  const collectedToday = progress.last_day_date === today;
  const allDaysDone = currentDay >= TOTAL_DAYS;

  const days = SCHEDULE.map((required, i) => {
    const dayIndex = i + 1;
    const done = doneByDay.get(dayIndex);
    return {
      day: dayIndex,
      required,
      done: Boolean(done),
      collectedOn: done ? done.log_date : null,
      active: !allDaysDone && !collectedToday && dayIndex === currentDay + 1,
    };
  });

  const activeDay = allDaysDone ? null : currentDay + 1;
  const paidToday =
    todayRow && !collectedToday ? Number(todayRow.paid_amount) : 0;
  const requiredToday = activeDay ? requiredFor(activeDay) : null;

  return {
    eventCode: EVENT_CODE,
    today,
    totalDays: TOTAL_DAYS,
    totalRequired: SCHEDULE.reduce((a, b) => a + b, 0),
    currentDay,
    allDaysDone,
    rewardVnd: REWARD_VND,
    rewardClaimed: Boolean(Number(progress.reward_claimed)),
    canClaim: allDaysDone && !Number(progress.reward_claimed),
    startDate: progress.start_date,
    days,
    todayStatus: {
      collected: collectedToday,
      dayIndex: activeDay,
      required: requiredToday,
      paid: paidToday,
      remaining: requiredToday ? Math.max(0, requiredToday - paidToday) : 0,
    },
  };
}

/**
 * Nhận thưởng ngày 7. Tự mở transaction riêng.
 * @param {*} pool  mysql2 pool
 */
async function claimReward(pool, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [pRows] = await conn.query(
      `SELECT current_day, reward_claimed
         FROM daily_recharge_progress
        WHERE user_id = ?
          FOR UPDATE`,
      [userId]
    );

    if (pRows.length === 0 || Number(pRows[0].current_day) < TOTAL_DAYS) {
      throw new EventError(
        "NOT_COMPLETED",
        `Bạn cần thu đủ ${TOTAL_DAYS} viên trước khi nhận thưởng.`
      );
    }
    if (Number(pRows[0].reward_claimed) === 1) {
      throw new EventError("ALREADY_CLAIMED", "Bạn đã nhận thưởng rồi.", 409);
    }

    try {
      await conn.query(
        `INSERT INTO event_reward_log (user_id, event_code, vnd_amount, note)
         VALUES (?, ?, ?, ?)`,
        [userId, EVENT_CODE, REWARD_VND, "Thuong hoan thanh nap 7 ngay"]
      );
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        throw new EventError("ALREADY_CLAIMED", "Bạn đã nhận thưởng rồi.", 409);
      }
      throw err;
    }

    await conn.query(
      `UPDATE account SET vnd = vnd + ?, tongnap = tongnap + ? WHERE id = ?`,
      [REWARD_VND, REWARD_VND, userId]
    );
    await conn.query(
      `UPDATE daily_recharge_progress
          SET reward_claimed = 1, claimed_at = NOW()
        WHERE user_id = ?`,
      [userId]
    );

    await conn.commit();
    return { rewardVnd: REWARD_VND };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  EVENT_CODE,
  SCHEDULE,
  TOTAL_DAYS,
  REWARD_VND,
  EventError,
  vnToday,
  requiredFor,
  applyRecharge,
  getStatus,
  claimReward,
};