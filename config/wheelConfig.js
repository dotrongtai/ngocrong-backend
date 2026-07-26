// config/wheelConfig.js
// ⚙️ Cấu hình Vòng Quay May Mắn - NGUỒN DỮ LIỆU DUY NHẤT dùng ở backend.
// id / quantity / thứ tự index ở đây PHẢI khớp với js/prizes.js bên frontend
// (frontend chỉ giữ thêm icon để vẽ UI, không được tự quyết định phần thưởng).

const PRIZES = [
  { id: 1567, quantity: 1,   name: 'Cải trang Frieren' },     // index 0 - BẮT BUỘC rơi vào lượt 10
  { id: 16,   quantity: 5,   name: 'Ngọc Rồng 3 sao' },       // index 1
  { id: 828,  quantity: 100, name: 'Mảnh Khủng long' },       // index 2
  { id: 987,  quantity: 5,   name: 'Đá bảo vệ' },             // index 3
  { id: 1497, quantity: 1,   name: 'Pet rồng' },              // index 4 - lượt 8 hoặc 9
  { id: 457,  quantity: 20,  name: 'Thỏi vàng' },             // index 5
  { id: 1144, quantity: 1,   name: 'Phượng hoàng lửa' },      // index 6 - lượt 8 hoặc 9
  { id: 16,   quantity: 3,   name: 'Ngọc Rồng 3 sao' },       // index 7
  { id: 956,  quantity: 10,  name: 'Mảnh Đội Trưởng Vàng' },  // index 8
  { id: 457,  quantity: 10,  name: 'Thỏi vàng' }              // index 9
];

// Chi phí hồng ngọc cho lượt quay 1 -> 10 (tăng dần, tổng đúng bằng 2000)
const SPIN_COSTS = [5, 15, 30, 50, 80, 120, 170, 230, 300, 1000];

const MAX_SPINS = PRIZES.length; // 10

// Vị trí (index trong PRIZES) của 3 vật phẩm đặc biệt phải ra ở cuối
const FRIEREN_INDEX = 0;                 // BẮT BUỘC là lượt quay cuối cùng (lượt 10)
const SPECIAL_LAST_INDICES = [4, 6];     // Pet rồng & Phượng hoàng lửa -> lượt 8 và 9 (ngẫu nhiên ai trước ai sau)

// Các ô "thường" ra ngẫu nhiên không lặp lại trong 7 lượt đầu tiên
const NORMAL_INDICES = PRIZES
  .map((_, idx) => idx)
  .filter((idx) => idx !== FRIEREN_INDEX && !SPECIAL_LAST_INDICES.includes(idx));
// => [1, 2, 3, 5, 7, 8, 9]

// Vị trí hồng ngọc trong cột data_inventory của bảng player
// data_inventory ví dụ: [vàng, ngọc, hồng_ngọc, ?, ?]
const HONG_NGOC_INDEX = 2;

module.exports = {
  PRIZES,
  SPIN_COSTS,
  MAX_SPINS,
  FRIEREN_INDEX,
  SPECIAL_LAST_INDICES,
  NORMAL_INDICES,
  HONG_NGOC_INDEX
};