const express = require('express');
const router = express.Router();
const feishu = require('../feishu');

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const logs = await feishu.getRecentLogs(limit);
    res.json({ ok: true, data: { logs } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
