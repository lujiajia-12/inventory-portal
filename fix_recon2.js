#!/usr/bin/env node
/**
 * Fix E3-NC reconciliation: add E3 aggregated column Q and fix column N
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = 'ZbdBsX1e7hUJTMtdupScHPkGnbf';
const SHEET = '核对结果';

function runCli(cmd) {
  const full = `lark-cli sheets ${cmd} --spreadsheet-token ${TOKEN} --sheet-name "${SHEET}" --as user --format json`;
  try {
    const out = execSync(full, { encoding: 'utf-8', timeout: 120000, maxBuffer: 50*1024*1024 });
    const data = JSON.parse(out);
    if (!data.ok) throw new Error(data.error?.message || 'CLI error');
    return data.data;
  } catch(e) {
    console.error(`  FAIL: ${e.message.substring(0, 200)}`);
    return null;
  }
}

// Read all data
console.log('Reading current data...');
const rawData = fs.readFileSync(
  'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-Claude-code/97495050-fc7e-4124-94e1-3bc28738a493/tool-results/bawurbi4q.txt',
  'utf-8'
);
const allData = JSON.parse(rawData).data;

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

function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const rows = parseAnnotatedCSV(allData.annotated_csv);
const dataRows = rows.slice(1);
console.log(`  Total data rows: ${dataRows.length}`);

// Group E3 quantities by material code
const e3AggByMaterial = {};
for (const r of dataRows) {
  const code = r.fields[4]?.trim() || '';
  const qty = parseNum(r.fields[6]);
  if (!e3AggByMaterial[code]) e3AggByMaterial[code] = 0;
  e3AggByMaterial[code] += qty;
}

// Write Q header
console.log('\nWriting Q header...');
const hdrResult = runCli(`+csv-put --start-cell Q1 --csv "${csvEscape('E3入库数量(汇总)')}"`);

// Build Q column CSV and N column CSV
// Q = E3 aggregated quantity per material
// N = E3 aggregated - NC汇总

// Split into chunks to avoid too-long command lines
const CHUNK = 25;

for (let start = 0; start < dataRows.length; start += CHUNK) {
  const end = Math.min(start + CHUNK, dataRows.length);
  const chunk = dataRows.slice(start, end);

  // Q column values
  const qValues = chunk.map(r => {
    const code = r.fields[4]?.trim() || '';
    return e3AggByMaterial[code] || 0;
  });

  // N column values
  const nValues = chunk.map((r, i) => {
    const code = r.fields[4]?.trim() || '';
    const e3Agg = e3AggByMaterial[code] || 0;
    const ncQty = parseNum(r.fields[12]);
    return e3Agg - ncQty;
  });

  // Write Q column
  const qStartCell = `Q${start + 2}`;
  const qCsv = qValues.map(v => csvEscape(v)).join('\n');
  console.log(`\nQ ${qStartCell}:Q${end+1} [${qValues.length} values]`);
  runCli(`+csv-put --start-cell ${qStartCell} --allow-overwrite --csv "${qCsv.replace(/"/g, '\\"')}"`);

  // Write N column
  const nStartCell = `N${start + 2}`;
  const nCsv = nValues.map(v => csvEscape(v)).join('\n');
  console.log(`N ${nStartCell}:N${end+1} [${nValues.length} values]`);
  runCli(`+csv-put --start-cell ${nStartCell} --allow-overwrite --csv "${nCsv.replace(/"/g, '\\"')}"`);

  console.log(`  Done rows ${start+2}-${end+1} / ${dataRows.length+1}`);
}

// Verify by reading a few rows
console.log('\n\n=== Verification: Read first 10 rows ===');
const verify = runCli(`+csv-get --range "A1:Q10"`);
if (verify) {
  const lines = verify.annotated_csv.split('\n');
  for (const line of lines.slice(0, 5)) {
    console.log(line.substring(0, 200));
  }
}

console.log('\n\n========== DONE ==========');
console.log(`Q column: E3入库数量(汇总) written for ${dataRows.length} rows`);
console.log(`N column: 数量差异 corrected (E3汇总 - NC汇总)`);
console.log(`Materials aggregated: ${Object.keys(e3AggByMaterial).length}`);
