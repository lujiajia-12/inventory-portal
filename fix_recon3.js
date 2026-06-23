#!/usr/bin/env node
/**
 * Fix E3-NC reconciliation: add Q column (E3汇总) and fix N column
 * Uses temp files to pass multi-line CSV data
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = 'ZbdBsX1e7hUJTMtdupScHPkGnbf';
const SHEET = '核对结果';

function runCli(cmd) {
  const full = `lark-cli sheets ${cmd} --as user --format json`;
  try {
    const out = execSync(full, { encoding: 'utf-8', timeout: 60000, maxBuffer: 50*1024*1024, stdio: ['pipe','pipe','pipe'] });
    const data = JSON.parse(out);
    if (!data.ok) {
      console.error(`  API error: ${data.error?.message || 'unknown'}`);
      return null;
    }
    return data.data;
  } catch(e) {
    console.error(`  EXEC fail: ${e.message.substring(0, 200)}`);
    return null;
  }
}

function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Read the persisted output
console.log('Reading data...');
const rawData = fs.readFileSync(
  'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-Claude-code/97495050-fc7e-4124-94e1-3bc28738a493/tool-results/bawurbi4q.txt',
  'utf-8'
);

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseAnnotatedCSV(csv) {
  const rows = [];
  const lines = csv.trim().split('\n');
  let currentRow = null, currentData = '';
  for (const line of lines) {
    const match = line.match(/^\[row=(\d+)\] (.*)/);
    if (match) {
      if (currentRow !== null) rows.push({ row: currentRow, fields: parseCSVLine(currentData) });
      currentRow = parseInt(match[1]);
      currentData = match[2];
    } else currentData += '\n' + line;
  }
  if (currentRow !== null) rows.push({ row: currentRow, fields: parseCSVLine(currentData) });
  return rows;
}

function parseNum(s) {
  if (!s || s.trim() === '' || s.trim() === 'NC未找到') return 0;
  return parseFloat(s.replace(/,/g, '').trim()) || 0;
}

const allData = JSON.parse(rawData).data;
const rows = parseAnnotatedCSV(allData.annotated_csv);
const dataRows = rows.slice(1);
console.log(`  ${dataRows.length} data rows`);

// Group E3 quantities by material code
const e3AggByMaterial = {};
for (const r of dataRows) {
  const code = r.fields[4]?.trim() || '';
  const qty = parseNum(r.fields[6]);
  if (!e3AggByMaterial[code]) e3AggByMaterial[code] = 0;
  e3AggByMaterial[code] += qty;
}
console.log(`  ${Object.keys(e3AggByMaterial).length} unique materials`);

// Step 1: Write Q header
console.log('\n[1/3] Writing Q column header...');
const tmpDir = 'C:/Users/Administrator/Desktop/Claude code';
const hdrFile = path.join(tmpDir, '_tmp_hdr.csv');
fs.writeFileSync(hdrFile, csvEscape('E3入库数量(汇总)'), 'utf-8');
const hdrRes = runCli(`+csv-put --spreadsheet-token ${TOKEN} --sheet-name "${SHEET}" --start-cell Q1 --csv "@_tmp_hdr.csv"`);
if (hdrRes) console.log('  Q1 header written');
else console.log('  Q1 header may already exist');
try { fs.unlinkSync(hdrFile); } catch(_) {}

// Step 2: Write Q column data in batches
console.log('\n[2/3] Writing Q column (E3汇总数量)...');
const CHUNK = 40;

for (let start = 0; start < dataRows.length; start += CHUNK) {
  const end = Math.min(start + CHUNK, dataRows.length);
  const chunk = dataRows.slice(start, end);

  const qValues = chunk.map(r => {
    const code = r.fields[4]?.trim() || '';
    return String(e3AggByMaterial[code] || 0);
  });

  const csvContent = qValues.join('\r\n');
  const tmpFile = path.join(tmpDir, '_tmp_q.csv');
  fs.writeFileSync(tmpFile, csvContent, 'utf-8');

  const result = runCli(
    `+csv-put --spreadsheet-token ${TOKEN} --sheet-name "${SHEET}" --start-cell Q${start+2} --csv "@_tmp_q.csv"`
  );
  try { fs.unlinkSync(tmpFile); } catch(_) {}

  if (result) {
    console.log(`  Q${start+2}:Q${end+1} OK [${qValues.length} cells]`);
  } else {
    console.log(`  Q${start+2}:Q${end+1} FAILED`);
  }
}

// Step 3: Write N column data in batches
console.log('\n[3/3] Fixing N column (修正数量差异)...');

for (let start = 0; start < dataRows.length; start += CHUNK) {
  const end = Math.min(start + CHUNK, dataRows.length);
  const chunk = dataRows.slice(start, end);

  const nValues = chunk.map(r => {
    const code = r.fields[4]?.trim() || '';
    const e3Agg = e3AggByMaterial[code] || 0;
    const ncQty = parseNum(r.fields[12]);
    return String(e3Agg - ncQty);
  });

  const csvContent = nValues.join('\r\n');
  const tmpFile = path.join(tmpDir, '_tmp_n.csv');
  fs.writeFileSync(tmpFile, csvContent, 'utf-8');

  const result = runCli(
    `+csv-put --spreadsheet-token ${TOKEN} --sheet-name "${SHEET}" --start-cell N${start+2} --csv "@_tmp_n.csv"`
  );
  try { fs.unlinkSync(tmpFile); } catch(_) {}

  if (result) {
    console.log(`  N${start+2}:N${end+1} OK [${nValues.length} cells]`);
  } else {
    console.log(`  N${start+2}:N${end+1} FAILED`);
  }
}

// Verify
console.log('\n=== VERIFY ===');
const verify = JSON.parse(
  execSync(
    `lark-cli sheets +csv-get --spreadsheet-token ${TOKEN} --sheet-name "${SHEET}" --range "A1:Q8" --as user --format json`,
    { encoding: 'utf-8', timeout: 30000 }
  )
);

if (verify.ok) {
  const lines = verify.data.annotated_csv.split('\n');
  for (const line of lines.slice(0, 6)) {
    console.log(line.substring(0, 250));
  }
}

// Spot check material 6830AA800740 (should now diff=0 after aggregation)
console.log('\n=== SPOT CHECK: 6830AA800740 (A400 Pro 4K) ===');
const spotCheck = JSON.parse(
  execSync(
    `lark-cli sheets +csv-get --spreadsheet-token ${TOKEN} --sheet-name "${SHEET}" --range "G8:N9" --as user --format json`,
    { encoding: 'utf-8', timeout: 30000 }
  )
);
if (spotCheck.ok) {
  const lines = spotCheck.data.annotated_csv.split('\n');
  for (const line of lines) console.log(line.substring(0, 250));
}

console.log('\n========== DONE ==========');
