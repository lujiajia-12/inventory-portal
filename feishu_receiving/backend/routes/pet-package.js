const express = require('express');
const router = express.Router();
const f = require('../pet-feishu');

router.get('/:trackingNumber', async (req, res, next) => {
  try {
    const tn = req.params.trackingNumber.trim();
    if (tn.length < 3) return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: '运单号至少3个字符' } });
    const items = f.searchByTracking(tn);
    if (!items || items.length === 0) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `未找到运单号 "${tn}"` } });
    res.json({ ok: true, data: { trackingNumber: tn, totalItems: items.length, allConfirmed: items.every(i=>i['收货确认']===true), items } });
  } catch(e) { next(e); }
});
module.exports = router;
