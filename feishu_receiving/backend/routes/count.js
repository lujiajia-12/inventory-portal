/**
 * 仓库盘点 API 路由
 *
 * GET  /api/count/search?q=关键词  — 按物料编码/商品名称/条码搜索
 * POST /api/count/submit           — 提交盘点数据（备货区、库存区）
 * GET  /api/count/progress         — 盘点进度统计
 */
const express = require('express');
const router = express.Router();
const invFeishu = require('../inventory/feishu');

// ============ 搜索 ============

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) {
      return res.json({ ok: true, data: { items: [], query: q } });
    }

    const items = await invFeishu.searchItems(q);

    res.json({
      ok: true,
      data: { items, query: q, total: items.length },
    });
  } catch (e) {
    next(e);
  }
});

// ============ 提交盘点 ============

router.post('/submit', async (req, res, next) => {
  try {
    const { recordId, prepArea, storageArea, stockQty } = req.body;

    if (!recordId) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_INPUT', message: '请提供记录ID' },
      });
    }

    const result = await invFeishu.submitCount(recordId, prepArea, storageArea, stockQty);

    res.json({
      ok: true,
      data: result,
    });
  } catch (e) {
    next(e);
  }
});

// ============ 进度统计 ============

router.get('/progress', async (req, res, next) => {
  try {
    const stats = await invFeishu.getProgress();
    res.json({ ok: true, data: stats });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
