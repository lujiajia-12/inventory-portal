/**
 * 库存录入批量导入工具 v3
 * 多仓库独立页面 + 操作日志 + 访问码 + 供应商按名筛选
 * 启动: node inventory_portal.js
 */
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const iconv = require('iconv-lite');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3456;
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_aaa97390aff85cbd';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const BASE_TOKEN = 'SW0ibNH7UaJ2RAsSUOHcdiuOnfL';
const LOG_TABLE_ID = 'tblnVzkK3m3kvBgC';

// ============ 仓库配置 ============
const WAREHOUSES = [
  {
    key: 'xa226', name: 'XA226惠州仓',
    table_id: 'tbl54lsyJH45J5iV',
    fields: ['商品名称','料号','可用库存','分类'],
    fieldMap: { name:'商品名称', code:'料号', stock:'可用库存', category:'分类' },
    codeField:'料号', stockField:'可用库存',
    accessCode:'1234', contact:'惠州仓管-小刘',
  },
  {
    key: 'xa378', name: 'XA378永惠成品仓',
    table_id: 'tblD3cqD3QOzyUPx',
    fields: ['整机短代码','产品名称','成品库存','更新时间'],
    fieldMap: [
      {csvIdx:0,field:'整机短代码'},{csvIdx:1,field:'产品名称'},{csvIdx:2,field:'成品库存',type:'number'}
    ],
    codeField:'整机短代码', stockField:'成品库存',
    accessCode:'1234', contact:'永惠仓管-小王',
  },
  {
    key: 'supplier', name: '供应商仓',
    table_id: 'tbl8DiHODtjoeZ8y',
    fields: ['物料编码','物料名称','库存数量','供应商','订单未交数量','备注'],
    fieldMap: [
      {csvIdx:0,field:'物料编码'},{csvIdx:1,field:'物料名称'},{csvIdx:2,field:'库存数',type:'number'},
      {csvIdx:3,field:'供应商'},{csvIdx:4,field:'订单未交数量'},{csvIdx:5,field:'备注'}
    ],
    codeField:'物料编码', stockField:'库存数', supplierField:'供应商',
    accessCode:'1234', contact:'段慧琴',
  },
  {
    key: 'xa400', name: 'XA400咪哈成品仓',
    table_id: 'tblpThbpHYLqscPu',
    fields: ['物料编码','物料名称','规格','型号','主单位','库存数量','箱规','备注'],
    fieldMap: [
      {csvIdx:0,field:'物料编码'},{csvIdx:1,field:'物料名称'},{csvIdx:2,field:'规格'},
      {csvIdx:3,field:'型号'},{csvIdx:4,field:'主单位'},{csvIdx:5,field:'库存数量',type:'number'},
      {csvIdx:6,field:'箱规'},{csvIdx:7,field:'备注'}
    ],
    codeField:'物料编码', stockField:'库存数量',
    accessCode:'1234', contact:'咪哈仓管',
  },
];

function findWh(key) {
  if (!key) return null;
  for (const wh of WAREHOUSES) {
    if (wh.key === key || wh.name === key) return wh;
    try { if (decodeURIComponent(key) === wh.name) return wh; } catch(e) {}
  }
  return null;
}

// ============ 自动创建字段 ============

async function ensureField(tableId, fieldName, fieldType) {
  try {
    const data = await feishuRequest('GET',
      `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/fields`);
    if (data.code !== 0) {
      console.error(`[Field] 获取字段列表失败 ${tableId}: ${data.msg}`);
      return false;
    }
    const items = data.data?.items || [];
    if (items.some(item => item.field_name === fieldName)) {
      console.log(`[Field] "${fieldName}" 已存在于 ${tableId}`);
      return true;
    }
    const createResult = await feishuRequest('POST',
      `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/fields`,
      { field_name: fieldName, type: fieldType || 1 }
    );
    if (createResult.code === 0) {
      console.log(`[Field] 已创建 "${fieldName}" 在 ${tableId}`);
      return true;
    }
    console.error(`[Field] 创建 "${fieldName}" 失败: ${createResult.msg}`);
    return false;
  } catch (e) {
    console.error(`[Field] 确保 "${fieldName}" 出错: ${e.message}`);
    return false;
  }
}

// ============ 飞书 API ============
let cachedToken = null, tokenExpireAt = 0;

function getFeishuToken() {
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
        const j = JSON.parse(data);
        if (j.code === 0) {
          cachedToken = j.tenant_access_token;
          tokenExpireAt = Date.now() + (j.expire - 300) * 1000;
          resolve(cachedToken);
        } else reject(new Error('Token error: ' + data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function feishuRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    getFeishuToken().then(token => {
      const opts = {
        hostname: 'open.feishu.cn', path, method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    }).catch(reject);
  });
}

async function batchCreateRecords(tableId, records) {
  const results = { success: 0, failed: 0, errors: [] };
  for (let i = 0; i < records.length; i += 200) {
    const chunk = records.slice(i, i + 200);
    const data = await feishuRequest('POST',
      `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records/batch_create`,
      { records: chunk }
    );
    if (data.code === 0) results.success += chunk.length;
    else { results.failed += chunk.length; results.errors.push(data.msg || JSON.stringify(data)); }
    if (i + 200 < records.length) await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

async function writeLog(entry) {
  try {
    await feishuRequest('POST', `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${LOG_TABLE_ID}/records`, {
      fields: { '仓库名称': entry.warehouse, '上传人': entry.uploader, '文件名': entry.filename,
        '上传条数': entry.total, '成功条数': entry.success, '失败条数': entry.failed, '备注': entry.note || '' }
    });
  } catch (e) { console.error('写日志失败:', e.message); }
}

async function getUploadHistory(warehouse, limit = 20) {
  const data = await feishuRequest('GET', `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${LOG_TABLE_ID}/records?page_size=${limit}`);
  if (data.code !== 0 || !data.data) return [];
  return (data.data.items || []).map(r => ({
    time: r.fields['上传时间']||'', warehouse: r.fields['仓库名称']||'', uploader: r.fields['上传人']||'',
    filename: r.fields['文件名']||'', total: r.fields['上传条数']||0, success: r.fields['成功条数']||0, failed: r.fields['失败条数']||0
  }));
}

async function getRecords(tableId) {
  const records = []; let pageToken = null;
  while (true) {
    let p = `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records?page_size=500`;
    if (pageToken) p += `&page_token=${pageToken}`;
    const data = await feishuRequest('GET', p);
    if (data.code !== 0 || !data.data) break;
    if (data.data.items) records.push(...data.data.items);
    if (!data.data.has_more) break;
    pageToken = data.data.page_token;
  }
  return records;
}

async function getMainTableCodes() {
  const codes = new Set(); let pageToken = null;
  const tableId = 'tblxfUkBA54MdLYx';
  while (true) {
    let p = `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records?page_size=500`;
    if (pageToken) p += `&page_token=${pageToken}`;
    const data = await feishuRequest('GET', p);
    if (data.code !== 0 || !data.data) break;
    (data.data.items || []).forEach(r => {
      const code = (r.fields?.['料号'] || '').trim();
      if (code) codes.add(code);
    });
    if (!data.data.has_more) break;
    pageToken = data.data.page_token;
  }
  return codes;
}

// ============ 库存同步到总表 ============

const MAIN_TABLE = 'tblxfUkBA54MdLYx';
const MAIN_CODE_FIELD = '料号';

// 仓库 → 总表字段映射：每个仓库用哪个字段匹配总表料号，库存写入总表哪个字段
const STOCK_SYNC_MAP = [
  { whKey: 'xa226',  masterField: 'XA226惠州仓(自动)',     codeField: '料号',     stockField: '可用库存' },
  { whKey: 'xa378',  masterField: 'XA378永惠成品仓(自动)',  codeField: '整机短代码', stockField: '成品库存' },
  { whKey: 'supplier', masterField: 'ODM供应商仓(自动)',     codeField: '物料编码',   stockField: '库存数' },
  { whKey: 'xa400',  masterField: 'XA400咪哈成品仓(自动)',  codeField: '物料编码',   stockField: '库存数量' },
];

async function syncMasterStock() {
  const startTime = Date.now();
  const log = [];

  // 1. 读取总表所有记录，建立 料号 → record_id 索引
  console.log('[Sync] 读取库存总表...');
  const masterRecords = await getRecords(MAIN_TABLE);
  log.push(`总表${masterRecords.length}条`);

  const masterIndex = {}; // code → recordId
  for (const r of masterRecords) {
    const code = String(r.fields?.[MAIN_CODE_FIELD] || '').trim();
    if (code) masterIndex[code] = r.record_id;
  }

  // 2. 逐个仓库汇总库存
  const updates = {}; // recordId → { masterField: stockSum }

  for (const m of STOCK_SYNC_MAP) {
    const wh = findWh(m.whKey);
    if (!wh) continue;

    console.log(`[Sync] 读取 ${wh.name}...`);
    const whRecords = await getRecords(wh.table_id);
    let matched = 0;

    for (const r of whRecords) {
      const code = String(r.fields?.[m.codeField] || '').trim();
      const stock = parseInt(r.fields?.[m.stockField]) || 0;
      if (!code) continue;

      const masterId = masterIndex[code];
      if (!masterId) continue;

      if (!updates[masterId]) updates[masterId] = {};
      // 累加：同一料号在同一仓库有多条记录时求和
      updates[masterId][m.masterField] = (updates[masterId][m.masterField] || 0) + stock;
      matched++;
    }
    log.push(`${wh.name}匹配${matched}条`);
  }

  // 3. 批量更新总表
  const updateList = Object.entries(updates).map(([recordId, fields]) => ({
    record_id: recordId, fields,
  }));

  console.log(`[Sync] 待更新 ${updateList.length} 条`);
  let updated = 0, failed = 0;
  for (let i = 0; i < updateList.length; i += 200) {
    const chunk = updateList.slice(i, i + 200);
    const data = await feishuRequest('PATCH',
      `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${MAIN_TABLE}/records/batch_update`,
      { records: chunk }
    );
    if (data.code === 0) updated += chunk.length;
    else { failed += chunk.length; console.error('[Sync] 更新失败:', data.msg); }
    if (i + 200 < updateList.length) await new Promise(r => setTimeout(r, 500));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Sync] 完成: ${updated} updated, ${failed} failed, ${elapsed}s`);
  return { updated, failed, elapsed, log: log.join('; ') };
}

// ============ Express ============
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

// Suppress Alibaba Cloud FC's Content-Disposition: attachment on HTML pages
app.use((req, res, next) => {
  const _setHeader = res.setHeader.bind(res);
  res.setHeader = function(name, value) {
    if (name.toLowerCase() === 'content-disposition' && String(value).includes('attachment')) return res;
    return _setHeader(name, value);
  };
  const _set = res.set.bind(res);
  res.set = function(field, val) {
    if (typeof field === 'object') {
      const filtered = {};
      for (const [k, v] of Object.entries(field)) {
        if (k.toLowerCase() !== 'content-disposition' || !String(v).includes('attachment')) filtered[k] = v;
      }
      return _set(filtered);
    }
    if (field && field.toLowerCase() === 'content-disposition' && String(val || '').includes('attachment')) return res;
    return _set(field, val);
  };
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/count', (req, res) => res.sendFile(path.join(__dirname, 'public', 'count', 'index.html')));
app.get('/count/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'count', 'index.html')));
app.get('/:warehouse', (req, res) => {
  const wh = findWh(decodeURIComponent(req.params.warehouse));
  if (!wh) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'warehouse.html'));
});

app.get('/api/warehouses', (req, res) => {
  res.json({ ok: true, warehouses: WAREHOUSES.map(wh => ({
    name: wh.name, key: wh.key, fields: wh.fields, contact: wh.contact, hasCode: !!wh.accessCode, supplier: !!wh.supplierField
  }))});
});

app.post('/api/verify', (req, res) => {
  const wh = findWh(req.body.warehouse);
  if (!wh) return res.json({ ok: false, error: '仓库不存在' });
  if (wh.accessCode && req.body.code !== wh.accessCode) return res.json({ ok: false, error: '访问码错误' });
  res.json({ ok: true, warehouse: { name: wh.name, fields: wh.fields, contact: wh.contact, supplier: !!wh.supplierField } });
});

app.get('/api/template', (req, res) => {
  const wh = findWh(decodeURIComponent(req.query.warehouse || ''));
  if (!wh) return res.status(404).json({ ok: false, error: '仓库不存在' });
  const BOM = '﻿';
  const exampleRow = wh.fields.map((f, i) => {
    const ex = ['示例料号','示例产品','规格A','型号X','PCS','100','10','备注示例'];
    return ex[i] || f;
  }).join(',');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template.csv"');
  res.send(BOM + wh.fields.join(',') + '\n' + exampleRow + '\n');
});

app.post('/api/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: '未上传文件' });
    const wh = findWh(req.body.warehouse || '');
    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows = [];

    if (ext === '.csv') {
      let buf = req.file.buffer;
      let content = buf.toString('utf-8');
      if (content.includes('�') || /[\x80-\xFF]{2,}/.test(content.substring(0, 200))) {
        try { content = iconv.decode(buf, 'gbk'); } catch(e) {}
      }
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
      rows = content.split('\n').filter(l => l.trim()).map(line => {
        const cols = []; let col = '', inQuote = false;
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; continue; }
          if (ch === ',' && !inQuote) { cols.push(col.trim()); col = ''; continue; }
          col += ch;
        }
        cols.push(col.trim());
        return cols;
      });
    } else if (ext === '.xlsx' || ext === '.xls') {
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    } else {
      return res.status(400).json({ ok: false, error: '仅支持 CSV / Excel' });
    }

    if (rows.length === 0) return res.status(400).json({ ok: false, error: '文件为空' });
    const dataRows = rows.slice(1).filter(r => r.length >= 2 && String(r[1]).trim());

    const isExt = wh && Array.isArray(wh.fieldMap);
    const codeIdx = isExt ? wh.fieldMap.findIndex(m => m.field === (wh.codeField || '')) : 1;
    const stockIdx = isExt ? wh.fieldMap.findIndex(m => m.field === (wh.stockField || '')) : 2;

    const preview = dataRows.map(row => ({
      name: String(row[0] || '').trim(),
      code: String(row[codeIdx >= 0 ? codeIdx : 1] || '').trim(),
      stock: parseInt(row[stockIdx >= 0 ? stockIdx : 2]) || 0,
      category: String(row[3] || '').trim(),
      values: row.map(v => String(v || '').trim()),
    }));

    const mainCodes = await getMainTableCodes().catch(() => new Set());
    const withMatch = preview.map(item => ({ ...item, matched: mainCodes.has(item.code) }));
    const displayHeaders = wh ? wh.fields : ['商品名称','料号','可用库存','分类'];

    res.json({
      ok: true, headers: displayHeaders, total: withMatch.length,
      matched: withMatch.filter(i => i.matched).length,
      unmatched: withMatch.length - withMatch.filter(i => i.matched).length,
      rows: withMatch,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    const { warehouse, rows, uploader } = req.body;
    const wh = findWh(warehouse);
    if (!wh) return res.status(400).json({ ok: false, error: '仓库不存在: ' + (warehouse || '') });
    if (!rows || rows.length === 0) return res.status(400).json({ ok: false, error: '无数据' });

    const mainCodes = await getMainTableCodes().catch(() => new Set());

    // 提取供应商名称
    let supplierName = '';
    if (wh.supplierField) {
      const svals = rows.map(r => {
        const v = r.values || [];
        const idx = wh.fieldMap.findIndex(m => m.field === wh.supplierField);
        return String(idx >= 0 ? v[idx] : r.category || '').trim();
      }).filter(Boolean);
      supplierName = svals[0] || '';
    }

    // 删除旧数据
    const oldRecords = await getRecords(wh.table_id);
    let deletedCount = 0;
    const toDelete = wh.supplierField
      ? oldRecords.filter(r => {
          const sv = r.fields[wh.supplierField];
          if (Array.isArray(sv)) return sv.includes(supplierName);
          return String(sv || '').trim() === supplierName;
        })
      : oldRecords;
    for (let i = 0; i < toDelete.length; i += 500) {
      const ids = toDelete.slice(i, i + 500).map(r => r.record_id);
      const dr = await feishuRequest('POST',
        `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${wh.table_id}/records/batch_delete`,
        { records: ids }
      );
      if (dr.code === 0) deletedCount += ids.length;
    }

    // 写入新数据
    const isExtended = Array.isArray(wh.fieldMap);
    const records = rows.map(row => {
      const fields = {};
      if (isExtended) {
        const vals = row.values || [row.name, row.code, String(row.stock), row.category];
        wh.fieldMap.forEach(m => {
          let val = String(vals[m.csvIdx] || '').trim();
          if (m.field === '供应商') {
            fields[m.field] = val ? [val] : [];
          } else {
            fields[m.field] = m.type === 'number' ? (parseInt(val) || 0) : val;
          }
        });
        const codeVal = String(fields[wh.codeField] || '').trim();
        fields['状态'] = mainCodes.has(codeVal) ? ['已匹配'] : ['子新增料号'];
      } else {
        fields[wh.fieldMap.name] = String(row.name || '');
        fields[wh.fieldMap.code] = String(row.code || '').trim();
        fields[wh.fieldMap.stock] = parseInt(row.stock) || 0;
        fields[wh.fieldMap.category] = String(row.category || '');
        fields['状态'] = mainCodes.has(String(row.code || '').trim()) ? ['已匹配'] : ['子新增料号'];
      }
      if (wh.fields.includes('更新时间')) {
        fields['更新时间'] = new Date().toISOString().replace('T', ' ').substring(0, 16);
      }
      return { fields };
    });

    console.log('[UPLOAD] wh:', wh.key, 'supplier:', supplierName, 'rows:', rows.length);
    console.log('[UPLOAD] first record fields:', JSON.stringify(records[0]?.fields));
    const result = await batchCreateRecords(wh.table_id, records);
    console.log('[UPLOAD] result:', JSON.stringify(result));

    writeLog({
      warehouse: wh.name, uploader: uploader || '未知', filename: req.body.filename || '',
      total: rows.length, success: result.success, failed: result.failed,
      note: (supplierName ? `供应商:${supplierName} ` : '') + `清除${deletedCount}条 写入${result.success}条 ` + result.errors.join(';'),
    });

    // 上传后自动同步库存总表（仅有关联映射的仓库，后台执行不阻塞响应）
    if (STOCK_SYNC_MAP.some(m => m.whKey === wh.key)) {
      syncMasterStock().catch(e => console.error('[Sync] 上传后同步失败:', e.message));
    }

    res.json({
      ok: true, success: result.success, failed: result.failed,
      cleared: deletedCount, created: rows.length, supplier: supplierName || undefined,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const warehouse = req.query.warehouse || '';
    const history = await getUploadHistory(warehouse, 30);
    res.json({ ok: true, history: warehouse ? history.filter(h => h.warehouse === warehouse) : history });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    const data = await feishuRequest('GET', `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables`);
    res.json(data.code === 0 ? { ok: true, msg: '飞书连接正常' } : { ok: false, error: JSON.stringify(data) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/sync-stock', async (req, res) => {
  try {
    const result = await syncMasterStock();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Export for Alibaba Cloud FC serverless deployment
module.exports = app;

// ============ 仓库盘点手机端 ============
const COUNT_BASE_TOKEN = 'NJtDbaXpSasfuxs2Oadcn02Sncz';
const COUNT_TABLE_ID = 'tbl6YWlpSwOfjOJ7';

// 辅助：用飞书 API 搜盘点记录
async function searchCountItems(query) {
  const data = await feishuRequest('POST',
    `/open-apis/bitable/v1/apps/${COUNT_BASE_TOKEN}/tables/${COUNT_TABLE_ID}/records/search`,
    {
      filter: {
        conjunction: 'or',
        conditions: [
          { field_name: '物料编码', operator: 'contains', value: [query] },
          { field_name: '商品名称', operator: 'contains', value: [query] },
          { field_name: '商品条码', operator: 'contains', value: [query] },
        ],
      },
      page_size: 200,
    }
  );
  if (data.code !== 0) throw new Error(data.msg || 'Search failed');
  return (data.data?.items || []).map(r => {
    const f = r.fields || {};
    const unwrap = (v) => {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'object') return v[0].text || v[0].name || '';
      if (Array.isArray(v) && v.length > 1 && typeof v[0] === 'object') return v.map(x => x.text || x.name || '').join(', ');
      if (Array.isArray(v)) return v.join(', ');
      return String(v);
    };
    return {
      recordId: r.record_id,
      '物料编码': unwrap(f['物料编码']),
      '商品名称': unwrap(f['商品名称']),
      '商品条码': unwrap(f['商品条码']),
      '在库库存': unwrap(f['在库库存']),
      '备货区': unwrap(f['备货区']),
      '库存区': unwrap(f['库存区']),
      '盘点状态': unwrap(f['盘点状态']),
      '仓库': unwrap(f['仓库']),
      '仓库代码': unwrap(f['仓库代码']),
      '分类': unwrap(f['分类']),
    };
  });
}

// GET /api/count/search?q=关键词
app.get('/api/count/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ ok: true, data: { items: [], query: q } });
    const items = await searchCountItems(q);
    res.json({ ok: true, data: { items, query: q, total: items.length } });
  } catch (e) {
    res.status(500).json({ ok: false, error: { code: 'SEARCH_FAILED', message: e.message } });
  }
});

// POST /api/count/submit
app.post('/api/count/submit', async (req, res) => {
  try {
    const { recordId, prepArea, storageArea, stockQty } = req.body;
    if (!recordId) return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: '未提供记录ID' } });

    const prepNum = Number(prepArea) || 0;
    const storNum = Number(storageArea) || 0;
    const stockNum = Number(stockQty) || 0;
    const diff = stockNum - (prepNum + storNum);
    const statusValue = diff === 0 ? ['盘点正常'] : ['盘点差异'];

    const data = await feishuRequest('PUT',
      `/open-apis/bitable/v1/apps/${COUNT_BASE_TOKEN}/tables/${COUNT_TABLE_ID}/records/${recordId}`,
      { fields: { '备货区': String(prepNum), '库存区': String(storNum), '盘点状态': statusValue } }
    );
    if (data.code !== 0) throw new Error(data.msg || 'Update failed');

    res.json({ ok: true, data: { success: true, recordId, prepArea: prepNum, storageArea: storNum, diff, status: statusValue[0] } });
  } catch (e) {
    res.status(500).json({ ok: false, error: { code: 'SUBMIT_FAILED', message: e.message } });
  }
});

// GET /api/count/progress
app.get('/api/count/progress', async (req, res) => {
  try {
    const data = await feishuRequest('GET',
      `/open-apis/bitable/v1/apps/${COUNT_BASE_TOKEN}/tables/${COUNT_TABLE_ID}/records?page_size=500`
    );
    if (data.code !== 0) throw new Error(data.msg || 'Fetch failed');

    const items = data.data?.items || [];
    let counted = 0, normalCount = 0, diffCount = 0;
    for (const item of items) {
      const statusRaw = item.fields?.['盘点状态'];
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
    res.json({ ok: true, data: { total: items.length, counted, pending: items.length - counted, normalCount, diffCount } });
  } catch (e) {
    res.status(500).json({ ok: false, error: { code: 'PROGRESS_FAILED', message: e.message } });
  }
});

// Start local server only when run directly
if (require.main === module) {
  // 确保各仓库的"更新时间"字段 + 总表的自动汇总字段存在
  (async () => {
    for (const wh of WAREHOUSES) {
      if (wh.fields.includes('更新时间')) {
        await ensureField(wh.table_id, '更新时间', 1);
      }
    }
    // 总表的自动汇总字段（数字类型）
    for (const m of STOCK_SYNC_MAP) {
      await ensureField(MAIN_TABLE, m.masterField, 2);
    }
  })().catch(e => console.error('ensureField error:', e.message));

  app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }

    console.log('');
    console.log('  ==========================================');
    console.log('   库存录入批量导入工具 v3');
    console.log(`   本机访问: http://localhost:${PORT}`);
    console.log(`   局域网:   http://${localIP}:${PORT}`);
    WAREHOUSES.forEach(wh => console.log(`   ${wh.name}: /${wh.key}`));
    console.log('   按 Ctrl+C 停止');
    console.log('  ==========================================');
    console.log('');
    const { exec } = require('child_process');
    exec(`start http://localhost:${PORT}`);
  });
}
