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

// 🔧 Parse data_inventory - hỗ trợ cả dạng JSON "[1,2,3]" và dạng CSV thô "1,2,3"
function parseDataInventory(raw) {
  if (raw === null || raw === undefined || raw === '') return [0, 0, 0, 0, 0];
  const str = String(raw).trim();
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.map(Number);
  } catch (e) {
    // Không phải JSON hợp lệ -> thử tách theo dấu phẩy bên dưới
  }
  return str.replace(/^\[|\]$/g, '').split(',').map((v) => Number(v.trim()) || 0);
}

// 🔧 Serialize lại data_inventory đúng theo định dạng gốc đã đọc được (JSON hoặc CSV)
function serializeDataInventory(arr, originalRaw) {
  const wasJsonArray = originalRaw && String(originalRaw).trim().startsWith('[');
  return wasJsonArray ? JSON.stringify(arr) : arr.join(',');
}

// 🔔 Ghi 1 dòng vào hàng đợi để game server (đang chạy) tự đồng bộ cho player đang online.
// LƯU Ý QUAN TRỌNG: game server tra player online bằng PLAYERID_OBJECT.get(playerId) - tức
// theo cột `id` của bảng player, KHÔNG phải account_id. Nên bắt buộc phải truyền đúng playerId.
// Payload luôn là GIÁ TRỊ CUỐI CÙNG (SET), không phải delta -> xử lý trùng lặp vẫn an toàn.
async function queueSync(conn, accountId, playerId, action, payload) {
  await conn.query(
    'INSERT INTO player_sync_queue (account_id, player_id, action, payload) VALUES (?, ?, ?, ?)',
    [accountId, playerId, action, JSON.stringify(payload)]
  );
}

// 🎲 SPIN - Quay vòng bằng hồng ngọc (server quyết định phần thưởng, KHÔNG tin dữ liệu client gửi lên)
exports.spin = async (req, res) => {
  const userId = req.user.id;
  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1️⃣ Lấy player + khóa dòng (FOR UPDATE) để tránh quay 2 lượt cùng lúc trừ tiền sai
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

    // 2️⃣ Đếm tổng số lượt đã quay (claimed + unclaimed)
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

    const spinNumber = spinsDone + 1; // 1..10
    const cost = SPIN_COSTS[spinsDone];
    const currentHongNgoc = inventory[HONG_NGOC_INDEX] || 0;

    // 3️⃣ Kiểm tra đủ hồng ngọc không
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

    // 4️⃣ Lấy các wheel_index đã quay trúng để không lặp lại
    const [usedRows] = await conn.query(
      'SELECT wheel_index FROM user_rewards WHERE account_id = ?',
      [userId]
    );
    const usedIndices = usedRows.map((r) => r.wheel_index);

    // 5️⃣ Chọn wheel_index theo đúng quy tắc từng lượt
    let wheelIndex;

    if (spinNumber <= 7) {
      // 7 lượt đầu: random trong các ô "thường", không trùng ô đã có
      const available = NORMAL_INDICES.filter((i) => !usedIndices.includes(i));
      if (available.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống: hết ô phần thưởng thường' });
      }
      wheelIndex = available[Math.floor(Math.random() * available.length)];
    } else if (spinNumber === 8 || spinNumber === 9) {
      // Lượt 8, 9: random giữa Pet rồng và Phượng hoàng lửa, không trùng nhau
      const available = SPECIAL_LAST_INDICES.filter((i) => !usedIndices.includes(i));
      if (available.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống: hết ô phần thưởng đặc biệt' });
      }
      wheelIndex = available[Math.floor(Math.random() * available.length)];
    } else {
      // Lượt 10: BẮT BUỘC ra Cải trang Frieren
      wheelIndex = FRIEREN_INDEX;
    }

    const prize = PRIZES[wheelIndex];

    // 6️⃣ Trừ hồng ngọc và cập nhật player
    inventory[HONG_NGOC_INDEX] = currentHongNgoc - cost;
    const newInventoryRaw = serializeDataInventory(inventory, originalRaw);

    await conn.query('UPDATE player SET data_inventory = ? WHERE id = ?', [newInventoryRaw, player.id]);

    // 6.5️⃣ Báo game server đồng bộ NGAY nếu player đang online (không cần đăng xuất/đăng nhập lại)
    await queueSync(conn, userId, 'INVENTORY_SET', { data_inventory: inventory });

    // 7️⃣ Tạo record reward mới với status = unclaimed
    const [result] = await conn.query(
      'INSERT INTO user_rewards (account_id, item_id, quantity, status, wheel_index) VALUES (?, ?, ?, "unclaimed", ?)',
      [userId, prize.id, prize.quantity, wheelIndex]
    );

    await conn.commit();
    conn.release();

    return res.status(201).json({
      success: true,
      message: `✅ Quay thành công! Đã trừ ${cost} hồng ngọc.`,
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
        // bỏ qua lỗi rollback
      }
      conn.release();
    }
    console.error('Spin Error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  }
};

// 📊 STATUS - Trả về số lượt đã quay, chi phí lượt kế tiếp, số hồng ngọc hiện có
// Frontend gọi API này để hiển thị UI và tự kiểm tra trước khi cho bấm nút QUAY
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

    // 🔔 Báo game server đồng bộ NGAY nếu player đang online (không cần đăng xuất/đăng nhập lại)
    await queueSync(conn, userId, 'ITEMS_BAG_SET', { items_bag: itemsBag });

    await conn.commit();
    conn.release();

    return res.status(200).json({
      success: true,
      message: '✅ Vật phẩm đã được thêm vào hành trang!'
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