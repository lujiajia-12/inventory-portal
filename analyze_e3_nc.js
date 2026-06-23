#!/usr/bin/env node
/**
 * Analyze E3 vs NC reconciliation data and identify flaws
 * Problem: N column = E3单行数量 - NC汇总数量
 * Fix: should aggregate E3 quantities per material code
 */
const fs = require('fs');

// Read the persisted output
const rawData = fs.readFileSync(
  'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-Claude-code/97495050-fc7e-4124-94e1-3bc28738a493/tool-results/bawurbi4q.txt',
  'utf-8'
);
const data = JSON.parse(rawData);

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

const rows = parseAnnotatedCSV(data.data.annotated_csv);
const headerRow = rows[0];
const dataRows = rows.slice(1);

console.log(`Total data rows: ${dataRows.length}\n`);

// Group by material code (column E / index 4)
const byMaterial = {};
for (const r of dataRows) {
  const materialCode = r.fields[4]?.trim() || ''; // E列: E3货号
  if (!materialCode) continue;
  if (!byMaterial[materialCode]) byMaterial[materialCode] = [];
  byMaterial[materialCode].push(r);
}

// Find materials with multiple E3 entries
const duplicates = {};
const issues = [];

for (const [code, entries] of Object.entries(byMaterial)) {
  if (entries.length <= 1) continue;

  // Check if all entries have the same NC total
  const ncQtys = entries.map(e => parseNum(e.fields[12])); // M列: NC入库数量(汇总)
  const e3Qtys = entries.map(e => parseNum(e.fields[6]));  // G列: E3数量
  const uniqueNcQty = [...new Set(ncQtys)];

  const totalE3 = e3Qtys.reduce((a,b) => a+b, 0);
  const ncQty = ncQtys[0]; // Should all be the same

  // Check if NC qty is duplicated across rows
  const ncDup = uniqueNcQty.length === 1 && ncQtys.length > 1;

  if (ncDup || uniqueNcQty.length > 1) {
    duplicates[code] = {
      count: entries.length,
      totalE3,
      ncQty,
      perRowNcQty: ncQtys,
      perRowE3Qty: e3Qtys,
      // Current wrong diffs
      currentDiffs: entries.map(e => parseNum(e.fields[13])),
      // Correct diff (if aggregated)
      correctDiff: totalE3 - ncQty,
      entries: entries.map(e => ({
        row: e.row,
        seq: e.fields[0],
        e3Doc: e.fields[1],
        e3Qty: parseNum(e.fields[6]),
        ncDoc: e.fields[8],
        ncQty: parseNum(e.fields[12]),
        currentDiff: parseNum(e.fields[13]),
        status: e.fields[15],
      })),
    };
    issues.push({
      materialCode: code,
      materialName: entries[0].fields[5],
      e3Total: totalE3,
      ncTotal: ncQty,
      correctDiff: totalE3 - ncQty,
      e3DocCount: [...new Set(entries.map(e => e.fields[1]))].length,
      rowCount: entries.length,
      currentDiffs: entries.map(e => parseNum(e.fields[13])),
      ncIsDuplicated: ncDup,
    });
  }
}

console.log('=== QUALITY ISSUES FOUND ===');
console.log(`Materials with duplicate/repeated NC quantities: ${Object.keys(duplicates).length}\n`);

// Sort by impact (absolute correct diff)
issues.sort((a, b) => Math.abs(b.correctDiff) - Math.abs(a.correctDiff));

for (const issue of issues) {
  const dup = duplicates[issue.materialCode];
  console.log(`\n--- Material: ${issue.materialCode} ---`);
  console.log(`  名称: ${issue.materialName}`);
  console.log(`  E3单据数: ${issue.e3DocCount} | E3总行数: ${issue.rowCount}`);
  console.log(`  E3总数量: ${issue.e3Total}`);
  console.log(`  NC汇总数量: ${issue.ncTotal}`);
  console.log(`  当前各行差异: [${issue.currentDiffs.join(', ')}]`);
  console.log(`  修正后差异 (E3汇总 - NC): ${issue.correctDiff}`);
  console.log(`  NC数量是否重复: ${issue.ncIsDuplicated ? 'YES (每行显示相同NC汇总,导致重复计算)' : 'NO'}`);

  if (issue.correctDiff === 0) {
    console.log(`  ✅ 汇总后完全匹配! (当前显示为${dup.count}条差异记录)`);
  }
}

// Summary statistics
console.log('\n\n========== SUMMARY ==========');
const matchingAfterFix = issues.filter(i => i.correctDiff === 0);
const reducedAfterFix = issues.filter(i => i.correctDiff !== 0 && Math.abs(i.correctDiff) < Math.abs(i.currentDiffs[0]));

console.log(`\n修复后影响:`);
console.log(`  汇总后差异归零 (实为匹配): ${matchingAfterFix.length} 个物料`);
console.log(`  汇总后差异缩小: ${reducedAfterFix.length} 个物料`);

// Detailed CSV output for verification
const csvLines = ['物料编码,物料名称,E3单据数,E3总行数,E3总数量,NC汇总数量,修正差异,当前各行差异,是否重复'];
for (const issue of issues) {
  csvLines.push([
    issue.materialCode,
    `"${(issue.materialName||'').replace(/"/g,'""')}"`,
    issue.e3DocCount,
    issue.rowCount,
    issue.e3Total,
    issue.ncTotal,
    issue.correctDiff,
    `"${issue.currentDiffs.join(';')}"`,
    issue.ncIsDuplicated ? 'YES' : 'NO'
  ].join(','));
}

const csvPath = 'C:/Users/Administrator/Desktop/Claude code/e3_nc_analysis.csv';
fs.writeFileSync(csvPath, '﻿' + csvLines.join('\n'), 'utf-8');
console.log(`\nDetailed analysis saved to: ${csvPath}`);

// Output JSON for next step (writing fix to spreadsheet)
const fixData = {
  issues: Object.entries(duplicates).map(([code, d]) => ({
    materialCode: code,
    materialName: d.entries[0].fields[5],
    totalE3: d.totalE3,
    ncQty: d.ncQty,
    correctDiff: d.totalE3 - d.ncQty,
    e3Rows: d.entries.map(e => ({
      row: e.row,
      e3Doc: e.fields[1],
      e3Qty: parseNum(e.fields[6]),
      currentNcQty: parseNum(e.fields[12]),
      currentDiff: parseNum(e.fields[13]),
    })),
  })),
};

const fixPath = 'C:/Users/Administrator/Desktop/Claude code/recon_fix_data.json';
fs.writeFileSync(fixPath, JSON.stringify(fixData, null, 2), 'utf-8');
console.log(`Fix data saved to: ${fixPath}`);
