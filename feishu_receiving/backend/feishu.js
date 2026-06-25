/**
 * Feishu API client — direct REST API calls.
 * No dependency on lark-cli; deployable on any Node.js runtime.
 */
const https = require('https');
const path = require('path');
const config = require('./config');

// Load credentials from root .env (same as inventory_portal.js)
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';

// ============ Token Management ============

let cachedToken = null, tokenExpireAt = 0;

function getToken() {
  if (cachedToken && Date.now() < tokenExpireAt) return Promise.resolve(cachedToken);
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET });
    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
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
    req.on('error', reject);
    req.write(body);
    req.end();
  });
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
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  }));
}

// ============ Field Map Cache ============

let _fieldMap = null; // { fieldId: fieldName, fieldName: fieldId }

async function getFieldMap() {
  if (_fieldMap) return _fieldMap;

  const data = await api('GET',
    `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.tableId}/fields`
  );

  _fieldMap = {};
  const items = data.data?.items || [];
  for (const item of items) {
    _fieldMap[item.field_id] = item.field_name;
    _fieldMap[item.field_name] = item.field_id;
  }
  return _fieldMap;
}

// ============ Record Helpers ============

/**
 * Map API record (fields keyed by field_name) to a flat object.
 */
function mapRecord(fields) {
  const item = {};
  if (!fields) return item;
  for (const [key, val] of Object.entries(fields)) {
    let v = val;

    // Formula / lookup fields: { type: number, value: [...] }
    if (v && typeof v === 'object' && !Array.isArray(v) && v.value !== undefined) {
      v = v.value;
    }

    // Unwrap single-element arrays for select/person fields
    if (Array.isArray(v) && v.length === 1) {
      item[key] = v[0].text || v[0].name || v[0].id || String(v[0]);
    } else if (Array.isArray(v) && v.length > 1) {
      // Multi-select: join as comma-separated
      item[key] = v.map(x => x.text || x.name || x.id || String(x)).join(', ');
    } else if (v === null || v === undefined) {
      item[key] = '';
    } else if (typeof v === 'object') {
      // Fallback: try to extract text/name/id from object
      item[key] = v.text || v.name || v.id || JSON.stringify(v);
    } else {
      item[key] = v;
    }

    // Normalize checkboxes to boolean
    if (['收货确认', '少件', '错件', '破损', '空包裹'].includes(key)) {
      item[key] = item[key] === true || item[key] === 'true' || item[key] === 'True';
    }
  }
  return item;
}

// ============ Public API ============

/**
 * Search records by tracking number (运单号).
 */
async function searchByTracking(trackingNumber) {
  await getFieldMap();

  const searchBody = {
    filter: {
      conjunction: 'and',
      conditions: [
        {
          field_name: config.fields.trackingNumber,
          operator: 'is',
          value: [trackingNumber],
        },
      ],
    },
    page_size: 200,
  };

  const data = await api('POST',
    `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.tableId}/records/search`,
    searchBody
  );

  if (data.code !== 0) {
    throw new Error(data.msg || 'Search failed');
  }

  const items = (data.data?.items || []).map(r => ({
    recordId: r.record_id,
    ...mapRecord(r.fields),
  }));

  return items;
}

/**
 * Batch confirm receipt — update each record individually.
 */
async function batchConfirmReceive(recordIds) {
  if (!recordIds || recordIds.length === 0) {
    throw new Error('未提供要确认的记录');
  }

  const now = new Date();
  const localTime = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  let updatedCount = 0;
  for (const rid of recordIds) {
    try {
      const body = {
        fields: {
          [config.fields.receiveConfirm]: true,
          [config.fields.receiveStatus]: '收货正常',
          [config.fields.receiveTime]: localTime,
        },
      };
      const data = await api('PUT',
        `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.tableId}/records/${rid}`,
        body
      );
      if (data.code === 0) updatedCount++;
      else console.error(`Update ${rid} failed: ${data.msg}`);
    } catch (e) {
      console.error(`Update ${rid} error: ${e.message}`);
    }
  }

  return { updatedCount };
}

/**
 * Mark a record with discrepancy flags.
 */
async function markDiscrepancy(recordId, flags, note) {
  if (!recordId) throw new Error('未提供记录ID');

  const now = new Date();
  const localTime = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  const fields = {
    [config.fields.receiveStatus]: '收货异常',
    [config.fields.receiveTime]: localTime,
  };

  if (flags['少件']) fields[config.fields.lessItem] = true;
  if (flags['错件']) fields[config.fields.wrongItem] = true;
  if (flags['破损']) fields[config.fields.damaged] = true;
  if (flags['空包裹']) fields[config.fields.emptyPackage] = true;

  const reasons = [];
  if (flags['少件']) reasons.push('少件');
  if (flags['错件']) reasons.push('错件');
  if (flags['破损']) reasons.push('破损');
  if (flags['空包裹']) reasons.push('空包裹');
  if (reasons.length === 0 && note) reasons.push(note);
  fields[config.fields.discrepancyReason] = reasons.join('/');

  if (note) fields[config.fields.discrepancyNote] = note;

  const data = await api('PUT',
    `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.tableId}/records/${recordId}`,
    { fields }
  );

  if (data.code !== 0) {
    throw new Error(data.msg || 'Mark discrepancy failed');
  }

  return { success: true, recordId };
}

/**
 * Write an operation log entry.
 */
async function writeLog(trackingNumber, opType, count, detail) {
  if (!config.logTableId) return;
  try {
    const now = new Date();
    const localTime = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');

    await api('POST',
      `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.logTableId}/records`,
      {
        fields: {
          '操作时间': localTime,
          '运单号': trackingNumber,
          '操作类型': opType,
          '记录数': count,
          '详情': detail || '',
        },
      }
    );
  } catch (e) {
    console.error('[Log] Write failed:', e.message);
  }
}

/**
 * Read recent operation logs.
 */
async function getRecentLogs(limit = 30) {
  if (!config.logTableId) return [];
  try {
    const data = await api('GET',
      `/open-apis/bitable/v1/apps/${config.baseToken}/tables/${config.logTableId}/records?page_size=${limit}`
    );

    if (data.code !== 0) return [];

    return (data.data?.items || []).map(r => {
      const f = r.fields || {};
      return {
        '操作时间': f['操作时间'] || '',
        '运单号': f['运单号'] || '',
        '操作类型': f['操作类型'] || '',
        '记录数': f['记录数'] || 0,
        '详情': f['详情'] || '',
      };
    });
  } catch (e) {
    console.error('[Log] Read failed:', e.message);
    return [];
  }
}

module.exports = {
  searchByTracking,
  batchConfirmReceive,
  markDiscrepancy,
  writeLog,
  getRecentLogs,
};
