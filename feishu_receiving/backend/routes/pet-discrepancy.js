const express = require('express');
const router = express.Router();
const f = require('../pet-feishu');

router.post('/', async (req, res, next) => {
  try {
    const { recordId, flags, note, trackingNumber } = req.body;
    if (!recordId) return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: '请提供记录ID' } });
    if (!flags || Object.keys(flags).length === 0) return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: '请选择至少一个差异类型' } });
    const result = f.markDiscrepancy(recordId, flags, note || '');
    const reasons = Object.keys(flags).filter(k=>flags[k]).join('/');
    f.writeLog(trackingNumber || '', '标记异常', 1, reasons);
    res.json({ ok: true, data: result });
  } catch(e) { next(e); }
});
module.exports = router;
