#!/usr/bin/env node
/**
 * Fix E3-NC reconciliation: add E3 aggregated column and fix N column
 */
const { execSync } = require('child_process');
const fs = require('fs');

const TOKEN = 'ZbdBsX1e7hUJTMtdupScHPkGnbf';
const SHEET = '核对结果';

function run(cmd) {
  const full = `lark-cli sheets ${cmd} --spreadsheet-token ${TOKEN} --sheet-name "${SHEET}" --as user --format json`;
  const out = execSync(full, { encoding: 'utf-8', timeout: 120000, maxBuffer: 50*1024*1024 });
  const data = JSON.parse(out);
  if (!data.ok) throw new Error(data.error?.message || 'CLI error');
  return data.data;
}

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Read all data
console.log('Reading current data...');
const allData = run(`+csv-get --range "A1:P156"`);
console.log(`  Got data, ${allData.row_count} rows`);

// Parse the data
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

const rows = parseAnnotatedCSV(allData.annotated_csv);
const headerRow = rows[0];
const dataRows = rows.slice(1);

// Group E3 quantities by material code
const e3AggByMaterial = {};
for (const r of dataRows) {
  const code = r.fields[4]?.trim() || '';
  const qty = parseNum(r.fields[6]);
  if (!e3AggByMaterial[code]) e3AggByMaterial[code] = 0;
  e3AggByMaterial[code] += qty;
}

// Also track which materials appear in multiple rows
const materialRowCount = {};
for (const r of dataRows) {
  const code = r.fields[4]?.trim() || '';
  materialRowCount[code] = (materialRowCount[code] || 0) + 1;
}

// Prepare new values
// Column N (index 13, spreadsheet column N): 数量差异 = E3汇总 - NC汇总
// Column Q (new): E3入库数量(汇总)
const updates = [];
let qHeaderWritten = false;

// First, write Q column header (row 1)
console.log('Writing Q column header...');
try {
  run(`+cells-set --range "Q1:Q1" --cells "${esc('E3入库数量(汇总)')}"`);
  qHeaderWritten = true;
} catch(e) {
  console.log('  Q header may exist, continuing');
}

// Next, write all Q column values and fix N column
// Batch by rows in groups
const BATCH_SIZE = 50;

for (let batchStart = 0; batchStart < dataRows.length; batchStart += BATCH_SIZE) {
  const batchEnd = Math.min(batchStart + BATCH_SIZE, dataRows.length);

  // Write Q column (E3 aggregated)
  const qValues = [];
  const nValues = [];

  for (let i = batchStart; i < batchEnd; i++) {
    const r = dataRows[i];
    const code = r.fields[4]?.trim() || '';
    const e3Agg = e3AggByMaterial[code] || 0;
    const ncQty = parseNum(r.fields[12]); // M column
    const correctDiff = e3Agg - ncQty;

    qValues.push(String(e3Agg));
    nValues.push(String(correctDiff));
  }

  // Write Q column batch
  const qRange = `Q${batchStart + 2}:Q${batchEnd + 1}`;
  const qData = qValues.join(',');
  console.log(`  Writing Q column ${qRange}: ${qData.substring(0, 80)}...`);

  try {
    run(`+csv-put --range "${qRange}" --data "${qData}"`);
  } catch(e) {
    console.error(`  Q write failed: ${e.message}`);
  }

  // Write N column batch (fix quantity diff)
  const nRange = `N${batchStart + 2}:N${batchEnd + 1}`;
  const nData = nValues.join(',');
  console.log(`  Fixing N column ${nRange}: ${nData.substring(0, 80)}...`);

  try {
    run(`+csv-put --range "${nRange}" --data "${nData}"`);
  } catch(e) {
    console.error(`  N write failed: ${e.message}`);
  }

  console.log(`  Batch ${batchStart+1}-${batchEnd} / ${dataRows.length} done`);
}

// Write summary
console.log('\n========== FIX COMPLETE ==========');
console.log(`Total rows processed: ${dataRows.length}`);
console.log(`Materials with E3 aggregation: ${Object.keys(e3AggByMaterial).length}`);
console.log(`Materials with multiple E3 rows: ${Object.values(materialRowCount).filter(c => c > 1).length}`);

const dupMaterials = Object.entries(materialRowCount).filter(([k,v]) => v > 1).map(([k,v]) => k);
console.log(`\nMaterials with multiple E3 rows:`);
for (const code of dupMaterials) {
  console.log(`  ${code}: ${materialRowCount[code]} rows, E3总=${e3AggByMaterial[code]}`);
}
