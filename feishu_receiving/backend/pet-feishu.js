/**
 * Pet TC — direct REST API calls (same pattern as feishu.js).
 * Reuses the same auth flow, just different table/field config.
 */
const https = require('https');
const path = require('path');
const cfg = require('./pet-config');

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

let _fieldMap = null;

async function getFieldMap() {
  if (_fieldMap) return _fieldMap;
  const data = await api('GET',
    `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${cfg.tableId}/fields`
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

function mapRecord(fields) {
  const item = {};
  if (!fields) return item;
  const checkboxFields = ['收货确认', '少件', '错件', '破损', '空包'];
  for (const [key, val] of Object.entries(fields)) {
    let v = val;

    // Formula / lookup fields: { type: number, value: [...] }
    if (v && typeof v === 'object' && !Array.isArray(v) && v.value !== undefined) {
      v = v.value;
    }

    if (Array.isArray(v) && v.length === 1) {
      item[key] = v[0].text || v[0].name || v[0].id || String(v[0]);
    } else if (Array.isArray(v) && v.length > 1) {
      item[key] = v.map(x => x.text || x.name || x.id || String(x)).join(', ');
    } else if (v === null || v === undefined) {
      item[key] = '';
    } else if (typeof v === 'object') {
      item[key] = v.text || v.name || v.id || JSON.stringify(v);
    } else {
      item[key] = v;
    }
    if (checkboxFields.includes(key)) {
      item[key] = item[key] === true || item[key] === 'true' || item[key] === 'True';
    }
  }
  return item;
}

function nowStr() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');
}

// ============ Public API ============

async function searchByTracking(trackingNumber) {
  await getFieldMap();
  const data = await api('POST',
    `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${cfg.tableId}/records/search`,
    {
      filter: {
        conjunction: 'and',
        conditions: [
          { field_name: cfg.fields.trackingNumber, operator: 'is', value: [trackingNumber] },
        ],
      },
      page_size: 200,
    }
  );
  if (data.code !== 0) throw new Error(data.msg || 'Search failed');
  return (data.data?.items || []).map(r => ({
    recordId: r.record_id,
    ...mapRecord(r.fields),
  }));
}

async function batchConfirmReceive(recordIds) {
  if (!recordIds || recordIds.length === 0) throw new Error('未提供要确认的记录');
  let updatedCount = 0;
  for (const rid of recordIds) {
    try {
      const data = await api('PUT',
        `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${cfg.tableId}/records/${rid}`,
        {
          fields: {
            [cfg.fields.receiveConfirm]: true,
            [cfg.fields.receiveStatus]: '收货正常',
            [cfg.fields.receiveTime]: nowStr(),
          },
        }
      );
      if (data.code === 0) updatedCount++;
      else console.error(`Pet update ${rid} failed: ${data.msg}`);
    } catch (e) {
      console.error(`Pet update ${rid} error: ${e.message}`);
    }
  }
  return { updatedCount };
}

async function markDiscrepancy(recordId, flags, note) {
  if (!recordId) throw new Error('未提供记录ID');
  const fields = {
    [cfg.fields.receiveStatus]: '收货异常',
    [cfg.fields.receiveTime]: nowStr(),
  };
  if (flags['少件']) fields[cfg.fields.lessItem] = true;
  if (flags['错件']) fields[cfg.fields.wrongItem] = true;
  if (flags['破损']) fields[cfg.fields.damaged] = true;
  if (flags['空包裹']) fields[cfg.fields.emptyPackage] = true;
  if (note) fields[cfg.fields.discrepancyNote] = note;

  const data = await api('PUT',
    `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${cfg.tableId}/records/${recordId}`,
    { fields }
  );
  if (data.code !== 0) throw new Error(data.msg || 'Mark discrepancy failed');
  return { success: true, recordId };
}

async function writeLog(tn, opType, count, detail) {
  try {
    await api('POST',
      `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/tblMiQohPeHN4yVh/records`,
      {
        fields: {
          '操作时间': nowStr(),
          '运单号': tn,
          '操作类型': opType,
          '记录数': count,
          '详情': detail || '',
        },
      }
    );
  } catch (e) {
    console.error('[PetLog] Write failed:', e.message);
  }
}

module.exports = { searchByTracking, batchConfirmReceive, markDiscrepancy, writeLog };
