/**
 * 一键月度对账脚本
 * 用法: node auto_recon.js <账单Excel文件路径>
 *
 * 流程:
 *   1. 导入账单Excel到 Base 新表
 *   2. 自动匹配: 运单号 + 备件条码 / 商品编号
 *   3. 核对: 是否收货、商品明细是否一致、件数是否匹配
 *   4. 在对账单中标注差异
 *   5. 输出汇总报告
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LARK = 'lark-cli';
const BASE = 'SXTybVaS7aw3IusNNoFczGXpnQb';
const RECEIVE_TABLE = 'tbl6ckKCTJ2vvNHQ'; // 退货明细

function run(cmd, timeout = 120000) {
  const full = `${LARK} ${cmd} --as user --format json`;
  const out = execSync(full, { encoding: 'utf-8', timeout, maxBuffer: 50*1024*1024 });
  const r = JSON.parse(out.slice(out.indexOf('{')));
  if (!r.ok) throw new Error(r.error?.message || 'CLI error');
  return r.data;
}

function runFile(cmdPrefix, jsonObj) {
  const f = `_ar_${Date.now()}.json`;
  try {
    fs.writeFileSync(f, JSON.stringify(jsonObj), 'utf-8');
    return run(`${cmdPrefix} --json @${f}`);
  } finally { try { fs.unlinkSync(f); } catch (_) {} }
}

function val(v) { if (v===null||v===undefined) return ''; if (Array.isArray(v)) return v.length>0?String(v[0]):''; return String(v); }
function esc(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }

async function main() {
  const billFile = process.argv[2];
  if (!billFile) {
    console.error('用法: node auto_recon.js <账单Excel文件路径>');
    console.error('示例: node auto_recon.js "C:/Users/Administrator/Desktop/京东对账单6月.xlsx"');
    process.exit(1);
  }

  const absPath = path.resolve(billFile);
  if (!fs.existsSync(absPath)) {
    console.error(`文件不存在: ${absPath}`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════');
  console.log('  月度对账自动化');
  console.log('═══════════════════════════════════════════');
  console.log(`\n📄 账单文件: ${absPath}`);
  console.log(`📅 日期: ${new Date().toISOString().slice(0,10)}`);

  // Step 1: Import bill Excel into Base
  const billName = `对账单_${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
  console.log(`\n📥 Step 1/4: 导入账单到 Base...`);
  console.log(`   表名: ${billName}`);

  const importResult = run(
    `drive +import --type bitable --title "${billName}" --file "${absPath.replace(/\\/g,'\\\\')}"`,
    300000
  );

  // Find the imported table
  const baseBlocks = run(`base +base-block-list --base-token ${BASE}`);
  let billTableId = null;
  for (const b of (baseBlocks.blocks || baseBlocks || [])) {
    if (b.name === billName && b.type === 'table') {
      billTableId = b.id || b.block_id;
      break;
    }
  }

  if (!billTableId) {
    // Try to find by recent creation
    const tables = run(`base +table-list --base-token ${BASE}`);
    const lastTable = (tables.tables || tables || []).slice(-1)[0];
    if (lastTable) billTableId = lastTable.id;
  }

  if (!billTableId) throw new Error('无法找到导入的表');
  console.log(`   ✅ 表ID: ${billTableId}`);

  // Step 2: Ensure 账务核对差异 field exists
  console.log(`\n🔧 Step 2/4: 准备对账字段...`);
  try {
    run(`base +field-create --base-token ${BASE} --table-id ${billTableId} --json '{"name":"对账结果","type":"text"}'`);
  } catch (_) {
    // Field may already exist
  }
  console.log('   ✅ 完成');

  // Step 3: Read both tables
  console.log(`\n🔍 Step 3/4: 读取数据并对账...`);

  // Read receiving table
  const recvRecords = readAll(RECEIVE_TABLE);
  console.log(`   退货明细: ${recvRecords.length} 条`);

  // Read bill table
  const billRecords = readAll(billTableId);
  console.log(`   对账单: ${billRecords.length} 条`);

  // Build receiving index
  const idx = {};
  for (const r of recvRecords) {
    const tn = val(r['运单号']), bc = val(r['备件条码']), pc = val(r['商品编号']);
    if (tn) {
      if (bc) idx[`${tn}|B|${bc}`] = r;
      if (pc && !idx[`${tn}|P|${pc}`]) idx[`${tn}|P|${pc}`] = r;
    }
  }

  // Step 4: Match and annotate
  console.log(`\n📊 Step 4/4: 逐条核对并标注...`);

  let ok = 0, notFound = 0, mismatch = 0, abnormal = 0;

  for (let i = 0; i < billRecords.length; i++) {
    const bill = billRecords[i];
    const tn = val(bill['运单号']);
    const bc = val(bill['备件条码']);
    const pc = val(bill['商品编号']);
    const billId = bill._rid;

    let match = null;
    if (tn && bc) match = idx[`${tn}|B|${bc}`];
    if (!match && tn && pc) match = idx[`${tn}|P|${pc}`];

    let note = '';
    if (!match) {
      // Check if tracking number exists at all in receiving
      const tnOnly = tn ? Object.keys(idx).filter(k => k.startsWith(tn + '|')).length : 0;
      if (tnOnly > 0) {
        note = `商品明细不一致 — 运单号已收货但备件条码/商品编号不匹配`;
        mismatch++;
      } else {
        note = `未收货 — 运单号在退货明细中未找到`;
        notFound++;
      }
    } else {
      const st = val(match['收货状态']);
      const cf = val(match['收货确认']);
      if (st === '收货异常') {
        note = `收货异常: ${val(match['差异原因']) || '未注明'}`;
        abnormal++;
      } else if (st === '收货正常' || cf === 'true') {
        note = '核对无误 — 收货正常';
        ok++;
      } else {
        note = '待核对 — 已到货尚未确认';
        ok++;
      }
    }

    // Write result
    try {
      runFile(
        `base +record-upsert --base-token ${BASE} --table-id ${billTableId} --record-id "${esc(billId)}"`,
        { '对账结果': note }
      );
    } catch (e) {
      console.error(`   ❌ 写入失败 ${billId}: ${e.message}`);
    }

    if ((i + 1) % 100 === 0) console.log(`   进度: ${i + 1}/${billRecords.length}`);
  }

  // Report
  console.log('\n═══════════════════════════════════════════');
  console.log('  📋 对账完成');
  console.log('═══════════════════════════════════════════');
  console.log(`  总记录数:    ${billRecords.length}`);
  console.log(`  ✅ 核对无误:  ${ok}`);
  console.log(`  ❌ 明细不符:  ${mismatch}`);
  console.log(`  ❌ 未收货:    ${notFound}`);
  console.log(`  ⚠️  收货异常:  ${abnormal}`);
  console.log(`\n  结果已写入「对账结果」列`);
  console.log(`  Base: https://qau2vw8p0n.feishu.cn/base/${BASE}`);
}

function readAll(tableId) {
  const all = [];
  const fields = run(`base +field-list --base-token ${BASE} --table-id ${tableId}`);
  const id2name = {};
  for (const f of (fields.fields || fields || [])) id2name[f.id] = f.name;

  let offset = 0;
  while (true) {
    const data = run(`base +record-list --base-token ${BASE} --table-id ${tableId} --limit 200 --offset ${offset}`);
    const rows = data.data || [], fids = data.field_id_list || [], rids = data.record_id_list || [];
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

main().catch(e => { console.error('\n❌ 错误:', e.message); process.exit(1); });
