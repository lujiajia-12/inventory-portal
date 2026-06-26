/**
 * 库存推送 API 路由 — 手动触发推送库存到仓库沟通群
 *
 * POST /api/inventory/push  — 立即推送一次库存报告
 * GET  /api/inventory/stats — 获取库存统计数据 (不推送)
 */

const express = require('express');
const router = express.Router();
const { pushInventory, fetchAllRecords, analyzeInventory } = require('../inventory-push');

// 推送库存到群组
router.post('/push', async (req, res) => {
  try {
    const result = await pushInventory();
    res.json({ ok: true, data: result });
  } catch (e) {
    console.error(`[InventoryPush] 推送失败: ${e.message}`);
    res.status(500).json({
      ok: false,
      error: { code: 'PUSH_FAILED', message: e.message },
    });
  }
});

// 仅获取统计数据（不推送，用于预览/调试）
router.get('/stats', async (req, res) => {
  try {
    const records = await fetchAllRecords();
    const stats = analyzeInventory(records);
    res.json({ ok: true, data: stats });
  } catch (e) {
    console.error(`[InventoryPush] 统计失败: ${e.message}`);
    res.status(500).json({
      ok: false,
      error: { code: 'STATS_FAILED', message: e.message },
    });
  }
});

module.exports = router;
