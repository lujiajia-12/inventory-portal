/**
 * 库存推送模块 — 读取70迈库存总表并通过飞书机器人推送到群组
 *
 * 数据来源: 飞书多维表格 "70迈库存总表" (wiki中的bitable)
 * 推送目标: 仓库沟通群
 */

const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';

// HTTPS Agent with keep-alive for connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 8,
  maxFreeSockets: 4,
  timeout: 30000,
});

// ============ 配置 ============

const INVENTORY_BASE_TOKEN = 'SW0ibNH7UaJ2RAsSUOHcdiuOnfL';
const INVENTORY_TABLE_ID = 'tblxfUkBA54MdLYx';
const CHAT_ID = 'oc_55ca6b51e0c53f5c9e923a6b0b5b73a2';
const WIKI_URL = 'https://qau2vw8p0n.feishu.cn/base/SW0ibNH7UaJ2RAsSUOHcdiuOnfL?table=tblxfUkBA54MdLYx';

// 仓库字段名
const WAREHOUSE_FIELDS = [
  'XA226惠州仓(自动)',
  'XA378永惠成品仓(自动)',
  'XA400咪哈成品仓(自动)',
  'ODM供应商仓(自动)',
];

// ============ REST API ============

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
      agent: httpsAgent,
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

// ============ 数据读取 ============

function mapRecord(fields) {
  const item = {};
  if (!fields) return item;
  for (const [key, val] of Object.entries(fields)) {
    let v = val;
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
  }
  return item;
}

/**
 * 读取所有库存记录
 */
async function fetchAllRecords() {
  const tableId = INVENTORY_TABLE_ID;
  const baseToken = INVENTORY_BASE_TOKEN;
  const allRecords = [];
  let pageToken = null;

  do {
    let apiPath = `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records?page_size=200`;
    if (pageToken) apiPath += `&page_token=${pageToken}`;
    const r = await api('GET', apiPath);
    if (r.code !== 0) throw new Error(`读取表格失败: ${r.msg}`);
    const items = r.data?.items || [];
    allRecords.push(...items.map(rr => mapRecord(rr.fields)));
    pageToken = r.data?.has_more ? r.data?.page_token : null;
  } while (pageToken);

  return allRecords;
}

// ============ 统计分析 ============

function analyzeInventory(records) {
  const warehouses = WAREHOUSE_FIELDS;

  // 按产品线汇总
  const byProductLine = {};
  // 按库存分类汇总
  const byCategory = {};
  // 按仓库汇总
  const byWarehouse = {};
  for (const wh of warehouses) byWarehouse[wh] = 0;

  let totalStock = 0;
  let itemsWithStock = 0;
  let itemsWithStockList = [];

  for (const rec of records) {
    let recTotal = 0;
    let hasStock = false;
    for (const wh of warehouses) {
      const val = parseInt(rec[wh]) || 0;
      recTotal += val;
      byWarehouse[wh] += val;
      if (val > 0) hasStock = true;
    }
    totalStock += recTotal;
    if (hasStock) itemsWithStock++;

    const pl = rec['产品线'] || '未分类';
    byProductLine[pl] = (byProductLine[pl] || 0) + recTotal;

    const cat = rec['库存分类'] || '未分类';
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    if (hasStock) {
      itemsWithStockList.push({
        name: rec['产品名称'] || '',
        code: rec['料号'] || '',
        model: rec['项目型号'] || '',
        productLine: pl,
        stock: recTotal,
        wh226: parseInt(rec['XA226惠州仓(自动)']) || 0,
        wh378: parseInt(rec['XA378永惠成品仓(自动)']) || 0,
        wh400: parseInt(rec['XA400咪哈成品仓(自动)']) || 0,
        odm: parseInt(rec['ODM供应商仓(自动)']) || 0,
        supplier: rec['供应商名称'] || '',
        category: rec['分类'] || '',
      });
    }
  }

  // 排序：库存从高到低
  itemsWithStockList.sort((a, b) => b.stock - a.stock);

  return {
    totalSKU: records.length,
    itemsWithStock,
    totalStock,
    byProductLine,
    byCategory,
    byWarehouse,
    topItems: itemsWithStockList.slice(0, 15),
    allStockItems: itemsWithStockList,
  };
}

// ============ 消息格式化 ============

function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('zh-CN');
}

function buildPushCard() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'green',
      title: {
        content: `📊 库存日报 ${dateStr}`,
        tag: 'plain_text',
      },
    },
    elements: [
      {
        tag: 'markdown',
        content: `**库存更新通知**\n\n各位好，今日库存表已更新，请按需查看，若遇到库存异常需要确认核实，请直接联系对应仓位负责人。\n\n📞 各仓位负责人：\n• 惠州仓：段慧琴 [15112557191](tel:15112557191)\n• 永惠仓：方柄波 [13927482774](tel:13927482774)\n• 咪哈仓：刘华 [17817254498](tel:17817254498)\n• 爱培科仓：徐文凤 [13412012595](tel:13412012595)\n\n📎 [点击查看完整库存表](${WIKI_URL})`,
      },
    ],
  };

  return card;
}

// ============ 推送消息 ============

/**
 * 发送卡片消息到飞书群
 */
async function sendCardMessage(card) {
  const body = {
    receive_id: CHAT_ID,
    msg_type: 'interactive',
    content: JSON.stringify(card),
  };

  const r = await api('POST',
    `/open-apis/im/v1/messages?receive_id_type=chat_id`,
    body
  );

  if (r.code !== 0) {
    throw new Error(`发送消息失败: ${r.msg}`);
  }
  return r.data;
}

// ============ 主流程 ============

/**
 * 执行一次库存推送
 */
async function pushInventory() {
  console.log(`[库存推送] ${new Date().toISOString()} 开始推送...`);

  // 构建卡片
  const card = buildPushCard();
  console.log(`[库存推送] 卡片构建完成`);

  // 发送到群
  const result = await sendCardMessage(card);
  console.log(`[库存推送] 发送成功, message_id: ${result.message_id}`);

  return {
    ok: true,
    messageId: result.message_id,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { pushInventory, fetchAllRecords, analyzeInventory, buildPushCard };
