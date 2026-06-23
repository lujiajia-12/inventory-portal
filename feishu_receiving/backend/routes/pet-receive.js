const express = require('express');
const router = express.Router();
const f = require('../pet-feishu');

router.post('/', async (req, res, next) => {
  try {
    const { recordIds, trackingNumber } = req.body;
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: '请提供记录ID' } });
    const result = f.batchConfirmReceive(recordIds);
    f.writeLog(trackingNumber || '', '确认收货', recordIds.length, '');
    res.json({ ok: true, data: { updatedCount: result.updatedCount, totalRequested: recordIds.length } });
  } catch(e) { next(e); }
});
module.exports = router;
