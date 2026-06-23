const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const fs = require('fs');

router.post('/', async (req, res) => {
  try {
    const { recordId, tableId, value } = req.body;
    if (!recordId) return res.status(400).json({ ok: false, error: { message: '缺少recordId' } });

    const tid = tableId || 'tbl6ckKCTJ2vvNHQ';
    const fname = `_sn_${Date.now()}.json`;

    fs.writeFileSync(fname, JSON.stringify({ 'sn码': value || '' }), 'utf-8');

    const cmd = `lark-cli base +record-upsert --base-token SXTybVaS7aw3IusNNoFczGXpnQb --table-id ${tid} --record-id "${recordId}" --json @${fname} --as user --format json`;
    const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 15000 });
    fs.unlinkSync(fname);

    const r = JSON.parse(stdout.slice(stdout.indexOf('{')));
    if (!r.ok) throw new Error(r.error?.message || 'fail');
    res.json({ ok: true });
  } catch (e) {
    // Clean up any leftover temp file
    try { fs.unlinkSync(fname); } catch (_) {}
    res.status(500).json({ ok: false, error: { message: e.message } });
  }
});

module.exports = router;
