/**
 * Pet TC — reuses feishu.js operations but with pet-specific table/fields.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const cfg = require('./pet-config');

const LARK_CLI = 'lark-cli';

function esc(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }

function run(cmd) {
  const fullCmd = `${LARK_CLI} ${cmd} --as user --format json`;
  const stdout = execSync(fullCmd, { encoding:'utf-8', timeout:30000, maxBuffer:10*1024*1024 });
  const jsonStart = stdout.indexOf('{');
  const r = JSON.parse(stdout.slice(jsonStart));
  if (!r.ok) throw new Error(r.error?.message||'CLI error');
  return r.data;
}

function runWithFile(cmdPrefix, jsonObj) {
  const f = `_ptmp_${Date.now()}.json`;
  try { fs.writeFileSync(f, JSON.stringify(jsonObj), 'utf-8'); return run(`${cmdPrefix} --json @${f}`); }
  finally { try{fs.unlinkSync(f)}catch(_){} }
}

function val(v) {
  if (v===null||v===undefined) return '';
  if (Array.isArray(v)) return v.length>0?String(v[0]):'';
  if (typeof v==='boolean') return v;
  return String(v);
}

// Cache field map
let _fieldMap = null;
function getFieldMap() {
  if (_fieldMap) return _fieldMap;
  const data = run(`base +field-list --base-token ${cfg.baseToken} --table-id ${cfg.tableId}`);
  _fieldMap = {};
  for (const f of (data.fields||data||[])) { _fieldMap[f.id]=f.name; _fieldMap[f.name]=f.id; }
  return _fieldMap;
}

function searchByTracking(trackingNumber) {
  const data = run(`base +record-search --base-token ${cfg.baseToken} --table-id ${cfg.tableId} --keyword "${esc(trackingNumber)}" --search-field ${cfg.fields.trackingNumber} --limit 200`);
  const rows = data.data||[], fids = data.field_id_list||[], rids = data.record_id_list||[];
  const map = getFieldMap();
  const idxToName = fids.map(f=>map[f]||f);
  return rows.map((row,i)=>{
    const item = { recordId: rids[i]||'' };
    for(let j=0;j<row.length&&j<idxToName.length;j++) {
      let v = row[j];
      if (Array.isArray(v)) v = v.length>0?String(v[0]):'';
      if (v===null||v===undefined) v = ['收货确认','少件','错件','破损','空包'].includes(idxToName[j]) ? false : '';
      item[idxToName[j]] = v;
    }
    return item;
  });
}

function batchConfirmReceive(recordIds) {
  const now = new Date().toISOString().replace('T',' ').substring(0,16);
  let updated=0;
  for(const rid of recordIds) {
    try {
      const fields = {
        [cfg.fields.receiveConfirm]: true,
        [cfg.fields.receiveStatus]: '收货正常',
        [cfg.fields.receiveTime]: now,
      };
      runWithFile(`base +record-upsert --base-token ${cfg.baseToken} --table-id ${cfg.tableId} --record-id "${esc(rid)}"`, fields);
      updated++;
    } catch(e) { console.error(`Pet update fail ${rid}: ${e.message}`); }
  }
  return { updatedCount: updated };
}

function markDiscrepancy(recordId, flags, note) {
  const now = new Date().toISOString().replace('T',' ').substring(0,16);
  const fv = {
    [cfg.fields.receiveStatus]: '收货异常',
    [cfg.fields.receiveTime]: now,
  };
  if(flags['少件']) fv[cfg.fields.lessItem]=true;
  if(flags['错件']) fv[cfg.fields.wrongItem]=true;
  if(flags['破损']) fv[cfg.fields.damaged]=true;
  if(flags['空包裹']) fv[cfg.fields.emptyPackage]=true;
  if(note) fv[cfg.fields.discrepancyNote]=note;
  runWithFile(`base +record-upsert --base-token ${cfg.baseToken} --table-id ${cfg.tableId} --record-id "${esc(recordId)}"`, fv);
  return { success:true, recordId };
}

function writeLog(tn, opType, count, detail) {
  try {
    const fields = { '操作时间': new Date().toISOString().replace('T',' ').substring(0,16), '运单号': tn, '操作类型': opType, '记录数': count, '详情': detail||'' };
    runWithFile(`base +record-upsert --base-token ${cfg.baseToken} --table-id tblMiQohPeHN4yVh`, fields);
  } catch(e) { console.error('[PetLog]', e.message); }
}

module.exports = { searchByTracking, batchConfirmReceive, markDiscrepancy, writeLog };
