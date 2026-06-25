const express = require('express');
const router = express.Router();
const feishu = require('../feishu');

/**
 * POST /api/discrepancy
 * Mark a record with discrepancy flags.
 * Body: { recordId: string, flags: { 少件?, 错件?, 破损?, 空包裹? }, note?: string }
 */
router.post('/', async (req, res, next) => {
  try {
    const { recordId, flags, note } = req.body;

    if (!recordId) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_INPUT', message: '请提供记录ID' }
      });
    }

    if (!flags || Object.keys(flags).length === 0) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_INPUT', message: '请选择至少一个差异类型' }
      });
    }

    const result = await feishu.markDiscrepancy(recordId, flags, note || '');

    // Write log
    const tn = req.body.trackingNumber || '';
    const reasons = Object.keys(flags).filter(k => flags[k]).join('/');
    await feishu.writeLog(tn, '标记异常', 1, reasons);

    res.json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
