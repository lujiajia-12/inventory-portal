/**
 * Inventory counting Feishu client.
 * Reads via Feishu REST API, writes via lark-cli.
 * Self-contained token/API management (same pattern as ../feishu.js).
 */
const https = require('https');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const config = require('./config');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const LARK_CLI = 'lark-cli';

// ============ HTTPS Agent ============

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
});

// ============ lark-cli helpers ============

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runCli(cmdPrefix, jsonObj) {
  return new Promise((resolve, reject) => {
    const tmpFile = `_lark_inv_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(jsonObj), 'utf-8');
    } catch (e) {
      return reject(new Error(`Failed to write temp file: ${e.message}`));
    }

    const fullCmd = `${LARK_CLI} ${cmdPrefix} --json @${tmpFile} --as user --format json`;
    exec(fullCmd, {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}

      if (error) {
        return reject(new Error(`lark-cli exec error: ${error.message}${stderr ? ' — ' + stderr.trim() : ''}`));
      }

      try {
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) throw new Error('No JSON in output');
        const result = JSON.parse(stdout.slice(jsonStart));
        if (!result.ok) throw new Error(result.error?.message || 'lark-cli error');
        resolve(result.data);
      } catch (e) {
        reject(new Error(`lark-cli parse error: ${e.message}`));
      }
    });
  });
}

// ============ Retry helper ============

async function withRetry(fn, maxRetries = 2) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < maxRetries) {
        const delay = Math.pow(2, i) * 500;
        console.warn(`[InvRetry] Attempt ${i + 1} failed, retrying in ${delay}ms: ${e.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ============ REST API helpers ============

let cachedToken = null, tokenExpireAt = 0;
let tokenPromise = null;

function getToken() {
  if (cachedToken && Date.now() < tokenExpireAt) return Promise.resolve(cachedToken);
  if (tokenPromise) return tokenPromise;

  tokenPromise = new Promise((resolve, reject) => {
    const body = JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET });
    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      agent: httpsAgent,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        tokenPromise = null;
        try {
          const j = JSON.parse(data);
          if (j.code === 0) {
            cachedToken = j.tenant_access_token;
            tokenExpireAt = Date.now() + (j.expire - 300) * 1000;
            resolve(cachedToken);
          } else {
            reject(new Error(`Token error: ${j.msg || data}`));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', (e) => {
      tokenPromise = null;
      reject(e);
    });
    req.write(body);
    req.end();
  });

  return tokenPromise;
}

function api(method, apiPath, body) {
  return getToken().then(token => new Promise((resolve, reject) => {
    const opts = {
      hostname: 'open.feishu.cn',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      agent: httpsAgent,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Request timeout: ${method} ${apiPath}`));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  }));
}

// ============ Record Helper ============

function mapRecord(fields) {
  const item = {};
  if (!fields) return item;
  for (const [key, val] of Object.entries(fields)) {
    let v = val;
    // Unwrap single-value objects (text, number fields come as { value: ... } or [{ text: ... }])
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.value !== undefined) v = v.value;
    }
    if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'object') {
      item[key] = v[0].text || v[0].name || v[0].id || String(v[0]);
    } else if (Array.isArray(v) && v.length > 1 && typeof v[0] === 'object') {
      item[key] = v.map(x => x.text || x.name || x.id || String(x)).join(', ');
    } else if (v === null || v === undefined) {
      item[key] = '';
    } else if (typeof v === 'object') {
      item[key] = v.text || v.name || v.id || JSON.stringify(v);
    } else {
      item[key] = v;
    }
  }
  return item;
}

// ============ Public API ============

/**
 * Search inventory items by keyword (matches 物料编码 / 商品名称 / 商品条码).
 * Uses REST API with "contains" operator for fuzzy matching.
 */
async function searchItems(query) {
  if (!query || query.trim().length < 1) {
    return [];
  }

  const q = query.trim();

  const body = {
    filter: {
      conjunction: 'or',
      conditions: [
        { field_name: config.fields.materialCode, operator: 'contains', value: [q] },
        { field_name: config.fields.productName,  operator: 'contains', value: [q] },
        { field_name: config.fields.barcode,      operator: 'contains', value: [q] },
      ],
    },
    page_size: 200,
  };

  const data = await withRetry(() =>
    api('POST',
      `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.tableId}/records/search`,
      body
    )
  );

  if (data.code !== 0) throw new Error(data.msg || 'Search failed');

  return (data.data?.items || []).map(r => ({
    recordId: r.record_id,
    ...mapRecord(r.fields),
  }));
}

/**
 * Get a single record by record_id (used before submit to read stockQty).
 */
async function getRecord(recordId) {
  const data = await withRetry(() =>
    api('GET',
      `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.tableId}/records/${recordId}`
    )
  );

  if (data.code !== 0) throw new Error(data.msg || 'Get record failed');
  return mapRecord(data.data?.record?.fields || {});
}

/**
 * Submit counting result for one record.
 * Writes 备货区, 库存区, and 盘点状态 via lark-cli.
 *
 * @param {string} recordId
 * @param {number|string} prepArea    — quantity counted in prep area
 * @param {number|string} storageArea — quantity counted in storage area
 * @param {number|string} stockQty    — the system stock quantity (for discrepancy check)
 * @param {string} [warehouseCode]    — optional warehouse code if record already has one
 */
async function submitCount(recordId, prepArea, storageArea, stockQty) {
  if (!recordId) throw new Error('未提供记录ID');

  const baseArg = `--base-token ${config.baseToken}`;
  const tableArg = `--table-id ${config.tableId}`;

  const prepNum = Number(prepArea) || 0;
  const storNum = Number(storageArea) || 0;
  const stockNum = Number(stockQty) || 0;
  const diff = stockNum - (prepNum + storNum);

  const statusValue = diff === 0 ? ['盘点正常'] : ['盘点差异'];

  const fieldValues = {
    [config.fields.prepArea]: String(prepNum),
    [config.fields.storageArea]: String(storNum),
    [config.fields.countStatus]: statusValue,
  };

  const data = await runCli(
    `base +record-upsert ${baseArg} ${tableArg} --record-id "${esc(recordId)}"`,
    fieldValues
  );

  return {
    success: true,
    recordId,
    prepArea: prepNum,
    storageArea: storNum,
    diff,
    status: statusValue[0],
    data,
  };
}

/**
 * Get counting progress statistics.
 * Returns total, counted, and pending record counts.
 */
async function getProgress() {
  // Fetch all records (up to 500 for progress counting)
  const data = await withRetry(() =>
    api('GET',
      `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.tableId}/records?page_size=500`
    )
  );

  if (data.code !== 0) throw new Error(data.msg || 'Progress fetch failed');

  const items = data.data?.items || [];
  let counted = 0;
  let normalCount = 0;
  let diffCount = 0;

  for (const item of items) {
    const f = item.fields || {};
    const statusRaw = f[config.fields.countStatus];

    // Check if 盘点状态 is set (both API array format and direct value)
    let statusStr = '';
    if (Array.isArray(statusRaw) && statusRaw.length > 0) {
      statusStr = statusRaw.map(x => (x && typeof x === 'object') ? (x.text || x.name || '') : String(x || '')).join(',');
    } else if (statusRaw) {
      statusStr = String(statusRaw);
    }

    if (statusStr) {
      counted++;
      if (statusStr.includes('差异')) diffCount++;
      else normalCount++;
    }
  }

  const total = items.length;
  return {
    total,
    counted,
    pending: total - counted,
    normalCount,
    diffCount,
  };
}

module.exports = { searchItems, getRecord, submitCount, getProgress };
