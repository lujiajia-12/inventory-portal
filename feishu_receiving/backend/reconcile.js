/**
 * Reconciliation — JD bill vs warehouse receiving.
 * Searches receiving table per tracking number to avoid pagination issues.
 */
const { execSync } = require('child_process');
const fs = require('fs');

const LARK_CLI = 'lark-cli';

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runCli(cmd) {
  const fullCmd = `${LARK_CLI} ${cmd} --as user --format json`;
  const stdout = execSync(fullCmd, {
    encoding: 'utf-8', timeout: 60000, maxBuffer: 50 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const jsonStart = stdout.indexOf('{');
  const result = JSON.parse(stdout.slice(jsonStart));
  if (!result.ok) throw new Error(result.error?.message || 'CLI error');
  return result.data;
}

function runWithFile(cmdPrefix, jsonObj) {
  const f = `_recon_tmp_${Date.now()}.json`;
  try {
    fs.writeFileSync(f, JSON.stringify(jsonObj), 'utf-8');
    return runCli(`${cmdPrefix} --json @${f}`);
  } finally {
    try { fs.unlinkSync(f); } catch (_) {}
  }
}

function val(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : '';
  if (typeof v === 'boolean') return v;
  return String(v);
}

/**
 * Read ALL records using repeated calls with pagination.
 * Uses offset-based approach: read page by page until has_more=false.
 */
function readAllRecords(baseToken, tableId) {
  const all = [];
  let offset = 0;
  const pageSize = 200;

  // Get field metadata once
  const fieldData = runCli(`base +field-list --base-token ${baseToken} --table-id ${tableId}`);
  const idToName = {};
  for (const f of (fieldData.fields || fieldData || [])) {
    idToName[f.id] = f.name;
  }

  while (true) {
    const data = runCli(
      `base +record-list --base-token ${baseToken} --table-id ${tableId} --limit ${pageSize} --offset ${offset}`
    );
    const rows = data.data || [];
    const fieldIdList = data.field_id_list || [];
    const recordIdList = data.record_id_list || [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rec = { _record_id: recordIdList[i] || '' };
      for (let j = 0; j < row.length && j < fieldIdList.length; j++) {
        rec[idToName[fieldIdList[j]] || fieldIdList[j]] = row[j];
      }
      all.push(rec);
    }

    offset += rows.length;
    if (!data.has_more || rows.length === 0) break;
  }

  return all;
}

/**
 * Run reconciliation.
 * Builds in-memory index from ALL receiving records, then matches each bill record.
 */
function runReconciliation(updateBase = true) {
  const baseToken = 'SXTybVaS7aw3IusNNoFczGXpnQb';
  const billTableId = 'tblIXSlehpugT2vH';
  const receiveTableId = 'tbl6ckKCTJ2vvNHQ';

  console.log('[Reconcile] Reading 对账单 (all pages)...');
  const billRecords = readAllRecords(baseToken, billTableId);
  console.log(`[Reconcile] Read ${billRecords.length} bill records`);

  console.log('[Reconcile] Reading 退货明细 (all pages)...');
  const receiveRecords = readAllRecords(baseToken, receiveTableId);
  console.log(`[Reconcile] Read ${receiveRecords.length} receiving records`);

  // Build index from receiving records
  const receiveIdx = {};
  for (const r of receiveRecords) {
    const tn = val(r['运单号']);
    const bc = val(r['备件条码']);
    const pc = val(r['商品编号']);
    if (tn) {
      if (bc) receiveIdx[`${tn}|BARCODE|${bc}`] = r;
      if (pc) {
        const k = `${tn}|PRODUCT|${pc}`;
        if (!receiveIdx[k]) receiveIdx[k] = r;
      }
    }
  }
  console.log(`[Reconcile] Built receive index with ${Object.keys(receiveIdx).length} keys`);

  const results = [];
  let matchedOk = 0, matchedWarn = 0, unmatched = 0, discrepancy = 0;

  for (let i = 0; i < billRecords.length; i++) {
    const bill = billRecords[i];
    const tn = val(bill['运单号']);
    const bc = val(bill['备件条码']);
    const pc = val(bill['商品编号']);
    const billId = bill._record_id;

    let note = '';
    let status = 'error';
    let match = null;

    if (tn && bc) match = receiveIdx[`${tn}|BARCODE|${bc}`];
    if (!match && tn && pc) match = receiveIdx[`${tn}|PRODUCT|${pc}`];

    if (!match) {
      note = '未收货 — 退货明细中未找到匹配记录';
      status = 'error';
      unmatched++;
    } else {
      const st = val(match['收货状态']);
      const cf = val(match['收货确认']);
      const dr = val(match['差异原因']);
      const dn = val(match['差异备注']);

      if (st === '收货正常' || cf === 'true') {
        note = '核对无误';
        status = 'ok';
        matchedOk++;
      } else if (st === '收货异常') {
        note = `收货异常: ${dr || '未注明'}${dn ? ' — ' + dn : ''}`;
        status = 'error';
        discrepancy++;
      } else {
        note = '待核对 — 已到货尚未确认';
        status = 'warning';
        matchedWarn++;
      }
    }

    results.push({ recordId: billId, trackingNumber: tn, status, note });

    if (updateBase && note) {
      try {
        const cmd = `base +record-upsert --base-token ${baseToken} --table-id ${billTableId} --record-id "${esc(billId)}"`;
        runWithFile(cmd, { '账务核对差异': note });
      } catch (e) {
        console.error(`Update failed for ${billId}: ${e.message}`);
      }
    }

    // Progress
    if ((i + 1) % 50 === 0) {
      console.log(`[Reconcile] Progress: ${i + 1}/${billRecords.length}`);
    }
  }

  return {
    total: billRecords.length,
    matchedOk, matchedWarn, unmatched, discrepancy,
    results,
  };
}

module.exports = { runReconciliation };
