// Inventory counting Base configuration
// 仓库盘点表 — Feishu Bitable

module.exports = {
  // The Base containing 仓库库存表
  baseToken: 'NJtDbaXpSasfuxs2Oadcn02Sncz',

  // Main inventory table
  tableId: 'tbl6YWlpSwOfjOJ7',
  tableName: '仓库库存表',

  // Fields used in the inventory counting workflow
  fields: {
    materialCode: '物料编码',       // fld3RvENbB  — search key
    productName:  '商品名称',       // fld5My50Aa  — search key
    barcode:      '商品条码',       // fldN6beuHx
    stockQty:     '在库库存',       // fldr3gZ8F0 (number) — read-only reference
    prepArea:     '备货区',         // fldFQxfvul  — user input
    storageArea:  '库存区',         // fldDENGKRJ  — user input
    countStatus:  '盘点状态',       // fldCVSk5sz (multi-select: 盘点正常 / 盘点差异)
    warehouse:    '仓库',           // fld59c5Vsc (single-select)
    warehouseCode:'仓库代码',       // fld1IMvnP9
    category:     '分类',           // fld2leADea
  }
};
