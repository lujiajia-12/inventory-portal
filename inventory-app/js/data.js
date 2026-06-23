/**
 * data.js — Mock 数据层
 * 模拟飞书多维表格的仓库盘点数据。
 * 后续对接飞书 API 时，只需替换此文件的查询函数实现即可。
 *
 * 字段说明:
 *   id          - 唯一标识
 *   name        - 商品名称
 *   code        - 物料编码
 *   stock       - 在库数量 (系统记录)
 *   prepArea    - 备货区数量 (初始为空，盘点时填写)
 *   storageArea - 库存区数量 (初始为空，盘点时填写)
 *   barcode     - 商品69码 (EAN-13)
 *   unit        - 单位
 */

const INVENTORY_DATA = [
  { id: 1,  name: '纯牛奶 250ml×24盒',       code: 'WL-2024-0001', stock: 120, prepArea: '', storageArea: '', barcode: '6901234567890', unit: '箱' },
  { id: 2,  name: '原味酸奶 100g×8杯',       code: 'WL-2024-0002', stock: 85,  prepArea: '', storageArea: '', barcode: '6901234567906', unit: '箱' },
  { id: 3,  name: '全麦吐司面包 400g',       code: 'WL-2024-0003', stock: 200, prepArea: '', storageArea: '', barcode: '6901234567913', unit: '袋' },
  { id: 4,  name: '花生油 5L',               code: 'WL-2024-0004', stock: 60,  prepArea: '', storageArea: '', barcode: '6901234567920', unit: '桶' },
  { id: 5,  name: '生抽酱油 500ml',          code: 'WL-2024-0005', stock: 150, prepArea: '', storageArea: '', barcode: '6901234567937', unit: '瓶' },
  { id: 6,  name: '食用盐 400g',             code: 'WL-2024-0006', stock: 300, prepArea: '', storageArea: '', barcode: '6901234567944', unit: '袋' },
  { id: 7,  name: '白砂糖 1kg',              code: 'WL-2024-0007', stock: 90,  prepArea: '', storageArea: '', barcode: '6901234567951', unit: '袋' },
  { id: 8,  name: '东北大米 10kg',           code: 'WL-2024-0008', stock: 45,  prepArea: '', storageArea: '', barcode: '6901234567968', unit: '袋' },
  { id: 9,  name: '挂面 1kg',                code: 'WL-2024-0009', stock: 180, prepArea: '', storageArea: '', barcode: '6901234567975', unit: '袋' },
  { id: 10, name: '速冻水饺 猪肉白菜 500g',  code: 'WL-2024-0010', stock: 75,  prepArea: '', storageArea: '', barcode: '6901234567982', unit: '袋' },
  { id: 11, name: '番茄酱 320g',             code: 'WL-2024-0011', stock: 110, prepArea: '', storageArea: '', barcode: '6901234567999', unit: '瓶' },
  { id: 12, name: '鸡蛋 30枚装',             code: 'WL-2024-0012', stock: 50,  prepArea: '', storageArea: '', barcode: '6901234568002', unit: '盒' },
  { id: 13, name: '方便面 红烧牛肉 5连包',   code: 'WL-2024-0013', stock: 240, prepArea: '', storageArea: '', barcode: '6901234568019', unit: '包' },
  { id: 14, name: '橄榄油 750ml',            code: 'WL-2024-0014', stock: 35,  prepArea: '', storageArea: '', barcode: '6901234568026', unit: '瓶' },
  { id: 15, name: '陈醋 500ml',              code: 'WL-2024-0015', stock: 130, prepArea: '', storageArea: '', barcode: '6901234568033', unit: '瓶' },
  { id: 16, name: '蚝油 700g',               code: 'WL-2024-0016', stock: 95,  prepArea: '', storageArea: '', barcode: '6901234568040', unit: '瓶' },
  { id: 17, name: '料酒 500ml',              code: 'WL-2024-0017', stock: 140, prepArea: '', storageArea: '', barcode: '6901234568057', unit: '瓶' },
  { id: 18, name: '鸡精 200g',               code: 'WL-2024-0018', stock: 170, prepArea: '', storageArea: '', barcode: '6901234568064', unit: '袋' },
  { id: 19, name: '芝麻油 250ml',            code: 'WL-2024-0019', stock: 55,  prepArea: '', storageArea: '', barcode: '6901234568071', unit: '瓶' },
  { id: 20, name: '火锅底料 麻辣 200g',      code: 'WL-2024-0020', stock: 100, prepArea: '', storageArea: '', barcode: '6901234568088', unit: '袋' },
];

/**
 * 按物料编码后4位查询
 * @param {string} last4 - 物料编码最后4位
 * @returns {Promise<Array>} 匹配的商品列表
 */
function queryByCode(last4) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const clean = last4.trim();
      if (!clean) { resolve([]); return; }
      const results = INVENTORY_DATA.filter(item =>
        item.code.slice(-clean.length) === clean
      );
      resolve(results);
    }, 100);
  });
}

/**
 * 按商品名称模糊查询
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 匹配的商品列表
 */
function queryByName(keyword) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const clean = keyword.trim().toLowerCase();
      if (!clean) { resolve([]); return; }
      const results = INVENTORY_DATA.filter(item =>
        item.name.toLowerCase().includes(clean)
      );
      resolve(results);
    }, 100);
  });
}

/**
 * 按条形码（69码）精确查询
 * @param {string} barcode - 扫描得到的条形码
 * @returns {Promise<Object|null>} 匹配的商品，未找到返回 null
 */
function queryByBarcode(barcode) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const clean = barcode.trim();
      const result = INVENTORY_DATA.find(item => item.barcode === clean);
      resolve(result || null);
    }, 100);
  });
}

/**
 * 按 ID 获取单个商品
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
function getItemById(id) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(INVENTORY_DATA.find(item => item.id === id) || null);
    }, 50);
  });
}

/**
 * 获取全部盘点商品列表
 * @returns {Promise<Array>}
 */
function getAllItems() {
  return new Promise((resolve) => {
    setTimeout(() => resolve([...INVENTORY_DATA]), 50);
  });
}
