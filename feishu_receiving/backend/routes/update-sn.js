const express = require('express');
const https = require('https');
const path = require('path');
const router = express.Router();

require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const BASE_TOKEN = 'SXTybVaS7aw3IusNNoFczGXpnQb';

// ============ Token ============

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
          } else reject(new Error(`Token: ${j.msg}`));
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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  }));
}

// ============ Route ============

router.post('/', async (req, res) => {
  try {
    const { recordId, tableId, value } = req.body;
    if (!recordId) return res.status(400).json({ ok: false, error: { message: '缺少recordId' } });

    const tid = tableId || 'tbl6ckKCTJ2vvNHQ';

    const data = await api('PUT',
      `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tid}/records/${recordId}`,
      { fields: { 'sn码': value || '' } }
    );

    if (data.code !== 0) throw new Error(data.msg || 'Update failed');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: { message: e.message } });
  }
});

module.exports = router;
