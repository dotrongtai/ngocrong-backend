
const PRIZES = [
  { id: 1567, quantity: 1,   name: 'Cải trang Frieren' },     
  { id: 16,   quantity: 5,   name: 'Ngọc Rồng 3 sao' },      
  { id: 828,  quantity: 100, name: 'Mảnh Khủng long' },       
  { id: 987,  quantity: 5,   name: 'Đá bảo vệ' },             
  { id: 1497, quantity: 1,   name: 'Pet rồng' },             
  { id: 457,  quantity: 20,  name: 'Thỏi vàng' },            
  { id: 1144, quantity: 1,   name: 'Phượng hoàng lửa' },      
  { id: 16,   quantity: 3,   name: 'Ngọc Rồng 3 sao' },       
  { id: 956,  quantity: 10,  name: 'Mảnh Đội Trưởng Vàng' }, 
  { id: 457,  quantity: 10,  name: 'Thỏi vàng' }             
];

const SPIN_COSTS = [5, 15, 30, 50, 80, 120, 170, 230, 300, 1000];

const MAX_SPINS = PRIZES.length; 


const FRIEREN_INDEX = 0;                
const SPECIAL_LAST_INDICES = [4, 6];    

const NORMAL_INDICES = PRIZES
  .map((_, idx) => idx)
  .filter((idx) => idx !== FRIEREN_INDEX && !SPECIAL_LAST_INDICES.includes(idx));
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