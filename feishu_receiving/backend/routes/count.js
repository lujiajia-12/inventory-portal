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
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function escSh(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runLarkCli(cmdPrefix, jsonObj, attempt = 0) {
  const MAX_RETRIES = 3;
  return new Promise((resolve, reject) => {
    const tmpFile = `_lark_cnt_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(jsonObj), 'utf-8');
    } catch (e) {
      return reject(new Error(`无法写入临时文件: ${e.message}`));
    }
    exec(`lark-cli ${cmdPrefix} --json @${tmpFile} --as user --format json`, {
      encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}

      if (error) {
        const msg = stderr ? stderr.trim() : error.message;
        // Retry on timeout or transient errors
        if (attempt < MAX_RETRIES && (error.killed || error.code === null || error.code === 1)) {
          console.warn(`[CountSubmit] lark-cli retry ${attempt + 1}/${MAX_RETRIES}: ${msg}`);
          return resolve(runLarkCli(cmdPrefix, jsonObj, attempt + 1));
        }
        return reject(new Error(`飞书写入失败: ${msg}`));
      }

      try {
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) throw new Error('响应无JSON数据');
        const result = JSON.parse(stdout.slice(jsonStart));
        if (!result.ok) {
          const errMsg = result.error?.message || '飞书写入错误';
          // Retry on permission/auth errors (may be transient token issues)
          if (attempt < MAX_RETRIES && (errMsg.includes('token') || errMsg.includes('auth') || errMsg.includes('permission'))) {
            console.warn(`[CountSubmit] lark-cli auth retry ${attempt + 1}/${MAX_RETRIES}: ${errMsg}`);
            return resolve(runLarkCli(cmdPrefix, jsonObj, attempt + 1));
          }
          throw new Error(errMsg);
        }
        resolve(result.data);
      } catch (e) {
        reject(new Error(`飞书响应解析失败: ${e.message}`));
      }
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
      `base +record-upsert ${baseArg} ${tableArg} --record-id "${escSh(recordId)}"`,
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

// ============ 内联盘点页面 (绕过静态文件的 FC Content-Disposition 问题) ============
const countCss = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'count', 'css', 'style.css'), 'utf-8');
const countApiJs = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'count', 'js', 'api.js'), 'utf-8');
const countAppJs = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'count', 'js', 'app.js'), 'utf-8');

router.get('/page', (req, res) => {
  res.type('html');
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>仓库盘点</title>
<style>${countCss}</style>
</head>
<body>
<header class="header"><h1>📋 仓库盘点</h1></header>
<div class="search-area">
<input type="text" id="searchInput" class="search-input" placeholder="🔍 输入料号 / 条码 / 名称搜索..." autofocus autocomplete="off" inputmode="search">
<div class="search-hint">输入后自动搜索 · 点击结果卡片展开录入</div>
</div>
<div class="progress-bar">
<div class="progress-item"><span class="progress-num" id="statCounted">-</span><span class="progress-label">已盘</span></div>
<div class="progress-divider"></div>
<div class="progress-item"><span class="progress-num" id="statPending">-</span><span class="progress-label">待盘</span></div>
<div class="progress-divider"></div>
<div class="progress-item"><span class="progress-num" id="statTotal">-</span><span class="progress-label">总计</span></div>
<div class="progress-divider"></div>
<div class="progress-item text-green"><span class="progress-num" id="statNormal">-</span><span class="progress-label">正常</span></div>
<div class="progress-divider"></div>
<div class="progress-item text-orange"><span class="progress-num" id="statDiff">-</span><span class="progress-label">差异</span></div>
</div>
<div id="resultsContainer" class="results-container"><div id="resultCount" class="result-count hidden"></div><div id="itemCards" class="item-cards"></div></div>
<div id="emptyState" class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">输入料号或名称开始盘点</div><div class="empty-desc">支持物料编码、商品条码(69码)、商品名称模糊搜索</div></div>
<div id="loadingState" class="loading-state hidden"><div class="spinner"></div><div>搜索中...</div></div>
<div id="errorState" class="error-state hidden"><div id="errorMessage" class="error-message"></div><button id="errorRetry" class="btn-submit btn-submit-primary" style="display:none;width:auto;margin-top:14px;padding:10px 32px">🔄 重试</button></div>
<div id="toast" class="toast hidden"></div>
<script>${countApiJs}</script>
<script>${countAppJs}</script>
</body>
</html>`);
});

module.exports = router;
