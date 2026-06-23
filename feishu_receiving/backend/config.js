// Feishu Base configuration
// Update these values to match your Base

module.exports = {
  // The Base containing the 退货明细 table
  baseToken: 'SXTybVaS7aw3IusNNoFczGXpnQb',

  // The table with return records
  tableId: 'tbl6ckKCTJ2vvNHQ',
  tableName: '退货明细',

  // Operation log table
  logTableId: 'tblMiQohPeHN4yVh',

  // Server port
  port: 3456,

  // Fields used in the receiving workflow
  fields: {
    trackingNumber: '运单号',
    productCode: '商品编号',
    productName: '商品名称',
    accessoryDetail: '配件明细',
    barcode: '备件条码',
    outboundOrder: '出库单号',
    receiveStatus: '收货状态',
    receiveConfirm: '收货确认',
    discrepancyReason: '差异原因',
    discrepancyNote: '差异备注',
    receiver: '收货人',
    receiveTime: '收货时间',
    // Discrepancy quick-mark checkboxes
    lessItem: '少件',
    wrongItem: '错件',
    damaged: '破损',
    emptyPackage: '空包裹',
  }
};
