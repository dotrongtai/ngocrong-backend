const pool = require('../config/database');
const {
  PRIZES,
  SPIN_COSTS,
  MAX_SPINS,
  FRIEREN_INDEX,
  SPECIAL_LAST_INDICES,
  NORMAL_INDICES,
  HONG_NGOC_INDEX
} = require('../config/wheelConfig');

function parseDataInventory(raw) {
  if (raw === null || raw === undefined || raw === '') return [0, 0, 0, 0, 0];
  const str = String(raw).trim();
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.map(Number);
  } catch (e) {
  }
  return str.replace(/^\[|\]$/g, '').split(',').map((v) => Number(v.trim()) || 0);
}

function serializeDataInventory(arr, originalRaw) {
  const wasJsonArray = originalRaw && String(originalRaw).trim().startsWith('[');
  return wasJsonArray ? JSON.stringify(arr) : arr.join(',');
}

exports.spin = async (req, res) => {
  const userId = req.user.id;
  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [accRows] = await conn.query(
      'SELECT last_time_login, last_time_logout FROM account WHERE id = ?',
      [userId]
    );

    if (accRows.length > 0) {
      const lastLogin = Number(accRows[0].last_time_login || 0);
      const lastLogout = Number(accRows[0].last_time_logout || 0);

      if (lastLogin > lastLogout) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          success: false,
          message: '⚠️ Vui lòng ĐĂNG XUẤT khỏi game trước khi quay!'
        });
      }
    }

    const [players] = await conn.query(
      'SELECT id, data_inventory FROM player WHERE account_id = ? FOR UPDATE',
      [userId]
    );

    if (players.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, message: 'Player không tồn tại' });
    }

    const player = players[0];
    const originalRaw = player.data_inventory;
    const inventory = parseDataInventory(originalRaw);

    const [countRows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM user_rewards WHERE account_id = ?',
      [userId]
    );
    const spinsDone = countRows[0].cnt;

    if (spinsDone >= MAX_SPINS) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: `Bạn đã quay đủ ${MAX_SPINS} lượt, không còn lượt quay nào nữa!`
      });
    }

    const spinNumber = spinsDone + 1; 
    const cost = SPIN_COSTS[spinsDone];
    const currentHongNgoc = inventory[HONG_NGOC_INDEX] || 0;

    if (currentHongNgoc < cost) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: `Không đủ hồng ngọc! Lượt này cần ${cost}, bạn đang có ${currentHongNgoc}.`,
        requiredCost: cost,
        currentHongNgoc
      });
    }

    const [usedRows] = await conn.query(
      'SELECT wheel_index FROM user_rewards WHERE account_id = ?',
      [userId]
    );
    const usedIndices = usedRows.map((r) => r.wheel_index);

    let wheelIndex;

    if (spinNumber <= 7) {
      const available = NORMAL_INDICES.filter((i) => !usedIndices.includes(i));
      if (available.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống: hết ô phần thưởng thường' });
      }
      wheelIndex = available[Math.floor(Math.random() * available.length)];
    } else if (spinNumber === 8 || spinNumber === 9) {
      const available = SPECIAL_LAST_INDICES.filter((i) => !usedIndices.includes(i));
      if (available.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống: hết ô phần thưởng đặc biệt' });
      }
      wheelIndex = available[Math.floor(Math.random() * available.length)];
    } else {
      wheelIndex = FRIEREN_INDEX;
    }

    const prize = PRIZES[wheelIndex];
    inventory[HONG_NGOC_INDEX] = currentHongNgoc - cost;
    const newInventoryRaw = serializeDataInventory(inventory, originalRaw);

    await conn.query('UPDATE player SET data_inventory = ? WHERE id = ?', [newInventoryRaw, player.id]);

    const [result] = await conn.query(
      'INSERT INTO user_rewards (account_id, item_id, quantity, status, wheel_index) VALUES (?, ?, ?, "unclaimed", ?)',
      [userId, prize.id, prize.quantity, wheelIndex]
    );

    await conn.commit();
    conn.release();

    return res.status(201).json({
      success: true,
      message: `Thành công rui kìa bé, kiểm tra ngay lịch sử quanh đó nha.`,
      rewardId: result.insertId,
      itemId: prize.id,
      quantity: prize.quantity,
      wheelIndex,
      spinNumber,
      costCharged: cost,
      hongNgocRemaining: inventory[HONG_NGOC_INDEX]
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
      }
      conn.release();
    }
    console.error('Spin Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const conn = await pool.getConnection();

    const [players] = await conn.query('SELECT data_inventory FROM player WHERE account_id = ?', [userId]);
    const [countRows] = await conn.query('SELECT COUNT(*) AS cnt FROM user_rewards WHERE account_id = ?', [userId]);
    const [usedRows] = await conn.query('SELECT wheel_index FROM user_rewards WHERE account_id = ?', [userId]);

    conn.release();

    if (players.length === 0) {
      return res.status(404).json({ success: false, message: 'Player không tồn tại' });
    }

    const inventory = parseDataInventory(players[0].data_inventory);
    const spinsDone = countRows[0].cnt;
    const nextCost = spinsDone < MAX_SPINS ? SPIN_COSTS[spinsDone] : null;
    const hongNgoc = inventory[HONG_NGOC_INDEX] || 0;

    return res.status(200).json({
      success: true,
      spinsDone,
      maxSpins: MAX_SPINS,
      nextSpinCost: nextCost,
      hongNgoc,
      canSpin: spinsDone < MAX_SPINS && nextCost !== null && hongNgoc >= nextCost,
      usedWheelIndices: usedRows.map((r) => r.wheel_index),
      spinCosts: SPIN_COSTS
    });
  } catch (error) {
    console.error('Get Status Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  }
};

exports.getUnclaimedRewards = async (req, res) => {
  try {
    const userId = req.user.id;

    const conn = await pool.getConnection();
    const [rewards] = await conn.query(
      'SELECT * FROM user_rewards WHERE account_id = ? AND status = "unclaimed" ORDER BY spin_time DESC',
      [userId]
    );

    conn.release();

    return res.status(200).json({
      success: true,
      rewards: rewards
    });
  } catch (error) {
    console.error('Get Unclaimed Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
};

exports.claimReward = async (req, res) => {
  const { rewardId } = req.body;
  const userId = req.user.id;
  let conn;

  try {
    if (!rewardId) {
      return res.status(400).json({
        success: false,
        message: 'rewardId bắt buộc'
      });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [accRows] = await conn.query(
      'SELECT last_time_login, last_time_logout FROM account WHERE id = ?',
      [userId]
    );

    if (accRows.length > 0) {
      const lastLogin = Number(accRows[0].last_time_login || 0);
      const lastLogout = Number(accRows[0].last_time_logout || 0);

      if (lastLogin > lastLogout) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          success: false,
          message: '⚠️ Vui lòng ĐĂNG XUẤT khỏi game trước khi nhận quà vào hành trang!'
        });
      }
    }

    const [rewards] = await conn.query(
      'SELECT * FROM user_rewards WHERE id = ? AND account_id = ? AND status = "unclaimed"',
      [rewardId, userId]
    );

    if (rewards.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'Quà không tồn tại hoặc đã được nhận'
      });
    }

    const reward = rewards[0];
    const itemId = reward.item_id;
    const quantity = reward.quantity;

    const [players] = await conn.query('SELECT id, items_bag FROM player WHERE account_id = ?', [userId]);

    if (players.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'Player không tồn tại'
      });
    }

    const player = players[0];
    const playerId = player.id;

    let itemsBag = [];
    try {
      itemsBag = JSON.parse(player.items_bag || '[]');
    } catch (e) {
      itemsBag = [];
    }

    const newItem = [itemId, quantity, '[]', Date.now()];

    let addedToEmpty = false;
    for (let i = 0; i < itemsBag.length; i++) {
      if (itemsBag[i][0] === -1) {
        itemsBag[i] = newItem;
        addedToEmpty = true;
        break;
      }
    }

    if (!addedToEmpty) {
      itemsBag.push(newItem);
    }

    const itemsBagJSON = JSON.stringify(itemsBag);
    await conn.query('UPDATE player SET items_bag = ? WHERE id = ?', [itemsBagJSON, playerId]);

    await conn.query('UPDATE user_rewards SET status = "claimed", claimed_time = NOW() WHERE id = ?', [rewardId]);

    await conn.commit();
    conn.release();

    return res.status(200).json({
      success: true,
      message: 'Vật phẩm đã được thêm vào hành trang!'
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        // bỏ qua lỗi rollback
      }
      conn.release();
    }
    console.error('Claim Reward Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const conn = await pool.getConnection();
    const [rewards] = await conn.query(
      'SELECT * FROM user_rewards WHERE account_id = ? ORDER BY spin_time DESC LIMIT 100',
      [userId]
    );

    conn.release();

    return res.status(200).json({
      success: true,
      rewards: rewards
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
};