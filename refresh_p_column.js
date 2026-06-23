#!/usr/bin/env node
/**
 * P列多商品聚合刷新脚本
 * 用法: node refresh_p_column.js
 * 功能: 从发货订单按单号聚合所有商品+数量，写入账单P列
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = "XFHFwuoKEi2m8gkVbK8c88L0nMc";
const OUT = __dirname;
const SHIP_TOTAL = 58383;
const BILL_TOTAL = 29464;

function callLark(sheet, range) {
    const cmd = `lark-cli sheets +csv-get --spreadsheet-token "${TOKEN}" --sheet-name "${sheet}" --range "${range}" --as user --format json`;
    const out = execSync(cmd, { timeout: 180000, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
    const d = JSON.parse(out);
    if (!d.ok) throw new Error(d.error?.message);
    return d.data.annotated_csv;
}

function* parseRows(csv) {
    let i = 0;
    const len = csv.length;
    while (i < len) {
        const rowStart = csv.indexOf('[row=', i);
        if (rowStart === -1) break;
        const numEnd = csv.indexOf(']', rowStart);
        if (numEnd === -1) break;
        const rowNum = parseInt(csv.substring(rowStart + 5, numEnd));
        let j = numEnd + 2;
        const fields = [];
        let cur = '', inQ = false;
        while (j < len) {
            const ch = csv[j];
            if (inQ) {
                if (ch === '"') {
                    if (j + 1 < len && csv[j + 1] === '"') { cur += '"'; j += 2; continue; }
                    else { inQ = false; j++; continue; }
                }
                if (ch === '\n' || ch === '\r') { cur += ch; j++; continue; }
                cur += ch; j++;
            } else {
                if (ch === '"') { inQ = true; j++; continue; }
                if (ch === ',') { fields.push(cur); cur = ''; j++; continue; }
                if (ch === '\n') { fields.push(cur); i = j + 1; break; }
                if (ch === '\r') { j++; continue; }
                cur += ch; j++;
            }
        }
        if (j >= len) { fields.push(cur); yield { row: rowNum, fields }; break; }
    }
}

function esc(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }

async function main() {
    const startTime = Date.now();
    console.log("=== P列多商品聚合刷新 ===\n");

    // Step 1: Read all shipping orders (A, G, I, J columns)
    console.log("Step 1/4: 读取发货订单...");
    const grouped = new Map();
    for (let s = 1; s <= SHIP_TOTAL; s += 1000) {
        const e = Math.min(s + 999, SHIP_TOTAL);
        const range = `A${s}:J${e}`;
        process.stderr.write(`\r  读取 ${range}...`);
        let csv;
        try { csv = callLark("发货订单", range); } catch (err) { csv = null; }
        if (!csv) { try { csv = callLark("发货订单", range); } catch (err) { continue; } }
        if (!csv) continue;
        for (const { fields } of parseRows(csv)) {
            const tn = (fields[0] || '').trim();
            if (!tn || tn === '物流单号') continue;
            const name = (fields[9] || fields[6] || '').trim();
            const qty = (fields[8] || '1').trim();
            if (!grouped.has(tn)) grouped.set(tn, []);
            if (name) grouped.get(tn).push({ name, qty });
        }
    }
    console.log(`\n  完成: ${grouped.size} 个单号`);

    // Step 2: Format as "商品（数量） 商品（数量）..."
    console.log("Step 2/4: 格式化...");
    const formatted = new Map();
    for (const [tn, items] of grouped) {
        const merged = new Map();
        for (const { name, qty } of items) {
            const key = `${name}|${qty}`;
            merged.set(key, (merged.get(key) || 0) + 1);
        }
        const parts = [];
        for (const [key, count] of merged) {
            const [name, qty] = key.split('|');
            parts.push(`${name}（${parseInt(qty) * count}）`);
        }
        formatted.set(tn, parts.join(' '));
    }
    console.log(`  有明细: ${formatted.size} 个`);

    // Step 3: Write to P column in batches
    console.log("Step 3/4: 写入账单P列...");
    let written = 0;
    for (let s = 2; s <= BILL_TOTAL; s += 1000) {
        const e = Math.min(s + 999, BILL_TOTAL);
        const billCsv = callLark("账单", `B${s}:B${e}`);
        const csvLines = [];
        for (const { fields } of parseRows(billCsv)) {
            const tn = (fields[0] || '').trim();
            csvLines.push(esc(formatted.get(tn) || ''));
        }
        const tmpFile = path.join(OUT, '.tmp_p_refresh.csv');
        fs.writeFileSync(tmpFile, csvLines.join('\n'), 'utf8');
        execSync(`lark-cli sheets +csv-put --spreadsheet-token "${TOKEN}" --sheet-name "账单" --start-cell "P${s}" --csv "@.tmp_p_refresh.csv" --as user --format json`, { timeout: 60000, encoding: 'utf8', cwd: OUT });
        fs.unlinkSync(tmpFile);
        written += csvLines.length;
        process.stderr.write(`\r  P${s}:P${e}  ${written}/${BILL_TOTAL - 1}`);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n=== 完成 (${elapsed}秒) ===`);
    console.log(`P列已更新为多商品聚合数据（静态值，不再自动更新）`);
    console.log(`如需恢复动态XLOOKUP，执行: node restore_p_xlookup.js`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
