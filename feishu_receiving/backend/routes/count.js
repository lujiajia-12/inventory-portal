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
// Uses lark-cli --as user for writes (app token lacks write permission on counting base)
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function runLarkCli(cmdPrefix, jsonObj) {
  return new Promise((resolve, reject) => {
    const tmpFile = `_lark_cnt_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(jsonObj), 'utf-8');
    } catch (e) {
      return reject(new Error(`Failed to write temp file: ${e.message}`));
    }
    exec(`lark-cli ${cmdPrefix} --json @${tmpFile} --as user --format json`, {
      encoding: 'utf-8', timeout: 15000, maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      if (error) return reject(new Error(`lark-cli error: ${error.message}${stderr ? ' — ' + stderr : ''}`));
      try {
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) throw new Error('No JSON in output');
        const result = JSON.parse(stdout.slice(jsonStart));
        if (!result.ok) throw new Error(result.error?.message || 'lark-cli error');
        resolve(result.data);
      } catch (e) { reject(new Error(`lark-cli parse error: ${e.message}`)); }
    });
  });
}

router.post('/submit', async (req, res, next) => {
  try {
    const { recordId, prepArea, storageArea, stockQty } = req.body;

    if (!recordId) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_INPUT', message: '请提供记录ID' },
      });
    }

    const prepNum = Number(prepArea) || 0;
    const storNum = Number(storageArea) || 0;
    const stockNum = Number(stockQty) || 0;
    const diff = stockNum - (prepNum + storNum);
    const statusValue = diff === 0 ? '盘点正常' : '盘点差异';
    const countBaseToken = 'NJtDbaXpSasfuxs2Oadcn02Sncz';
    const countTableId = 'tbl6YWlpSwOfjOJ7';

    const baseArg = `--base-token ${countBaseToken}`;
    const tableArg = `--table-id ${countTableId}`;

    await runLarkCli(
      `base +record-upsert ${baseArg} ${tableArg} --record-id "${recordId}"`,
      {
        '备货区': String(prepNum),
        '库存区': String(storNum),
        '盘点状态': [statusValue],
      }
    );

    res.json({
      ok: true,
      data: { success: true, recordId, prepArea: prepNum, storageArea: storNum, diff, status: statusValue },
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
