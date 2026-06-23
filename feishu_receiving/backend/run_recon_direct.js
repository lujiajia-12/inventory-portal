/**
 * Direct reconciliation script — updates only discrepancy records.
 * Run: node run_recon_direct.js
 */
const { execSync } = require('child_process');
const fs = require('fs');

function run(cmd) {
  const fullCmd = `lark-cli ${cmd} --as user --format json`;
  const stdout = execSync(fullCmd, { encoding: 'utf-8', timeout: 60000, maxBuffer: 50*1024*1024 });
  const jsonStart = stdout.indexOf('{');
  const result = JSON.parse(stdout.slice(jsonStart));
  if (!result.ok) throw new Error(result.error?.message || 'CLI error');
  return result.data;
}

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function val(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : '';
  if (typeof v === 'boolean') return v;
  return String(v);
}

const BASE = 'SXTybVaS7aw3IusNNoFczGXpnQb';
const BILL = 'tblIXSlehpugT2vH';
const RECV = 'tbl6ckKCTJ2vvNHQ';

function readAll(tableId) {
  const all = [];
  const fields = run(`base +field-list --base-token ${BASE} --table-id ${tableId}`);
  const id2name = {};
  for (const f of (fields.fields || fields || [])) {
    id2name[f.id] = f.name;
  }

  let offset = 0;
  while (true) {
    const data = run(`base +record-list --base-token ${BASE} --table-id ${tableId} --limit 200 --offset ${offset}`);
    const rows = data.data || [];
    const fids = data.field_id_list || [];
    const rids = data.record_id_list || [];
    for (let i = 0; i < rows.length; i++) {
      const rec = { _rid: rids[i] || '' };
      for (let j = 0; j < rows[i].length && j < fids.length; j++) {
        rec[id2name[fids[j]] || fids[j]] = rows[i][j];
      }
      all.push(rec);
    }
    offset += rows.length;
    if (!data.has_more || rows.length === 0) break;
  }
  return all;
}

async function main() {
  console.log('Reading 对账单...');
  const bills = readAll(BILL);
  console.log(`  ${bills.length} records`);

  console.log('Reading 退货明细...');
  const recvs = readAll(RECV);
  console.log(`  ${recvs.length} records`);

  // Build index
  const idx = {};
  for (const r of recvs) {
    const tn = val(r['运单号']);
    const bc = val(r['备件条码']);
    const pc = val(r['商品编号']);
    if (tn) {
      if (bc) idx[tn + '|B|' + bc] = r;
      if (pc && !idx[tn + '|P|' + pc]) idx[tn + '|P|' + pc] = r;
    }
  }
  console.log(`Index: ${Object.keys(idx).length} keys`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < bills.length; i++) {
    const b = bills[i];
    const tn = val(b['运单号']);
    const bc = val(b['备件条码']);
    const pc = val(b['商品编号']);

    let match = null;
    if (tn && bc) match = idx[tn + '|B|' + bc];
    if (!match && tn && pc) match = idx[tn + '|P|' + pc];

    let note = '';
    if (!match) {
      note = '未收货 — 退货明细中未找到匹配记录';
    } else {
      const st = val(match['收货状态']);
      const cf = val(match['收货确认']);
      if (st === '收货正常' || cf === 'true') {
        skipped++;
        continue;
      } else if (st === '收货异常') {
        const dr = val(match['差异原因']);
        const dn = val(match['差异备注']);
        note = '收货异常: ' + (dr || '未注明') + (dn ? ' — ' + dn : '');
      } else {
        note = '待核对 — 已到货尚未确认';
      }
    }

    // Write update via temp file
    const tmpF = '_rtmp_' + Date.now() + '.json';
    try {
      fs.writeFileSync(tmpF, JSON.stringify({ '账务核对差异': note }), 'utf-8');
      run('base +record-upsert --base-token ' + BASE + ' --table-id ' + BILL + ' --record-id "' + esc(b._rid) + '" --json @' + tmpF);
      updated++;
      if (updated % 100 === 0) console.log('  Updated ' + updated + '...');
    } catch (e) {
      console.error('  FAIL ' + b._rid + ': ' + e.message);
    } finally {
      try { fs.unlinkSync(tmpF); } catch (_) { }
    }
  }

  console.log('\n=== DONE ===');
  console.log('Updated: ' + updated);
  console.log('OK (skipped): ' + skipped);
}

main().catch(e => { console.error(e); process.exit(1); });
