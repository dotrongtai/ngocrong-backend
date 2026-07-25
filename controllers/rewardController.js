const pool = require('../config/database');

// 🎲 SPIN - Quay vòng (tạo reward trong database)
// 🎲 SPIN - Quay vòng (tạo reward trong database)
exports.spin = async (req, res) => {
  try {
    const { itemId, quantity, wheelIndex } = req.body;
    const userId = req.user.id;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: 'itemId bắt buộc'
      });
    }

    const conn = await pool.getConnection();

    // Tạo record reward mới với status = unclaimed và lưu lại vị trí ô vòng quay (wheel_index)
    const [result] = await conn.query(
      'INSERT INTO user_rewards (account_id, item_id, quantity, status, wheel_index) VALUES (?, ?, ?, "unclaimed", ?)',
      [userId, itemId, quantity || 1, wheelIndex !== undefined ? wheelIndex : null]
    );

    conn.release();

    return res.status(201).json({
      success: true,
      message: '✅ Quay thành công!',
      rewardId: result.insertId,
      itemId: itemId,
      quantity: quantity || 1
    });

  } catch (error) {
    console.error('Spin Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
};

// 📜 GET UNCLAIMED - Lấy danh sách quà chưa nhận
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

// 🎁 CLAIM - Nhận vào game (thêm vào items_bag)
exports.claimReward = async (req, res) => {
  try {
    const { rewardId } = req.body;
    const userId = req.user.id;

    if (!rewardId) {
      return res.status(400).json({
        success: false,
        message: 'rewardId bắt buộc'
      });
    }

    const conn = await pool.getConnection();

    // 1️⃣ Lấy reward
    const [rewards] = await conn.query(
      'SELECT * FROM user_rewards WHERE id = ? AND account_id = ? AND status = "unclaimed"',
      [rewardId, userId]
    );

    if (rewards.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'Quà không tồn tại hoặc đã được nhận'
      });
    }

    const reward = rewards[0];
    const itemId = reward.item_id;
    const quantity = reward.quantity;

    // 2️⃣ Lấy player
    const [players] = await conn.query(
      'SELECT id, items_bag FROM player WHERE account_id = ?',
      [userId]
    );

    if (players.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'Player không tồn tại'
      });
    }

    const player = players[0];
    const playerId = player.id;
    
    // 3️⃣ Parse items_bag
    let itemsBag = [];
    try {
      itemsBag = JSON.parse(player.items_bag || '[]');
    } catch (e) {
      itemsBag = [];
    }

    // 4️⃣ Tạo item mới theo format: [item_id, quantity, options_string, timestamp]
    const newItem = [
      itemId,
      quantity,
      '[]',
      Date.now()
    ];

    // 5️⃣ Tìm slot trống hoặc append
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

    // 6️⃣ Update player items_bag
    const itemsBagJSON = JSON.stringify(itemsBag);
    await conn.query(
      'UPDATE player SET items_bag = ? WHERE id = ?',
      [itemsBagJSON, playerId]
    );

    // 7️⃣ Update reward status thành claimed
    await conn.query(
      'UPDATE user_rewards SET status = "claimed", claimed_time = NOW() WHERE id = ?',
      [rewardId]
    );

    conn.release();

    return res.status(200).json({
      success: true,
      message: '✅ Vật phẩm đã được thêm vào hành trang!'
    });

  } catch (error) {
    console.error('Claim Reward Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
};

// 📜 GET HISTORY - Lấy toàn bộ lịch sử (claimed + unclaimed)
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