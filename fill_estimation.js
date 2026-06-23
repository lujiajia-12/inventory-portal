#!/usr/bin/env node
/**
 * 快递费预估表填充 - 从发货订单取唯一单号，计算预估费，写入预估表
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = "XFHFwuoKEi2m8gkVbK8c88L0nMc";
const SHEET = "快递费预估表";
const OUT_DIR = __dirname;

const REMOTE = new Set(["甘肃省","新疆维吾尔自治区","青海省","内蒙古自治区","西藏自治区","甘肃","新疆","青海","内蒙古","西藏"]);
const RULES = {
    "韵达快递": { firstW:1, firstP:2.8, inP:1.0, outP:1.5, remote:1.5, opFee:0.9 },
    "顺丰快递": { firstW:1, firstP:7.0, inP:1.5, outP:3.5, remote:14.0, opFee:1.0 },
    "顺丰惠州": { firstW:1, firstP:7.0, inP:1.5, outP:3.5, remote:14.0, opFee:1.0 },
};

const r = (v,d=2) => Math.round(v*10**d)/10**d;

function calcFee(courier, province, w) {
    const rule = RULES[courier]; if(!rule) return null;
    if(!w||w<=0) w=1;
    if(w<=rule.firstW) return r(rule.firstP+rule.opFee);
    const excess = Math.ceil(w-rule.firstW);
    let up;
    if(province==="广东省"||province==="广东") up=rule.inP;
    else if(REMOTE.has(province)) up=rule.remote;
    else up=rule.outP;
    return r(rule.firstP+excess*up+rule.opFee);
}

function normCourier(c) {
    if(c.includes('顺丰')) return '顺丰快递';
    if(c.includes('韵达')) return '韵达快递';
    return c;
}

function callLark(sheetName, rangeStr) {
    const cmd = `lark-cli sheets +csv-get --spreadsheet-token "${TOKEN}" --sheet-name "${sheetName}" --range "${rangeStr}" --as user --format json`;
    try {
        const out = execSync(cmd, { timeout:180000, encoding:'utf8', maxBuffer:50*1024*1024 });
        const d = JSON.parse(out);
        if(!d.ok) throw new Error(d.error?.message);
        return d.data.annotated_csv;
    } catch(e) { console.error(`API err: ${e.message}`); return null; }
}

function parseCSV(csv) {
    const rows = [];
    for(const line of csv.split('\n')) {
        if(!line.trim()) continue;
        const m = line.match(/^\[row=(\d+)\]\s*(.*)/); if(!m) continue;
        const rn=parseInt(m[1]), c=m[2];
        const f=[]; let cur='', inQ=false;
        for(let i=0;i<c.length;i++){
            const ch=c[i];
            if(inQ){ if(ch==='"'){ if(i+1<c.length&&c[i+1]==='"'){cur+='"';i++;} else inQ=false; } else cur+=ch; }
            else { if(ch==='"') inQ=true; else if(ch===','){f.push(cur);cur='';} else cur+=ch; }
        }
        f.push(cur); rows.push({row:rn, fields:f});
    }
    return rows;
}

function escCSV(s) { return '"'+String(s).replace(/"/g,'""')+'"'; }

async function main() {
    console.error("=== 快递费预估表填充 ===\n");

    // Step 1: Read all shipping orders
    console.error("Step 1: 读取发货订单...");
    const all = [];
    for(let s=1; s<=58008; s+=3000) {
        const e = Math.min(s+2999, 58008);
        const range = `A${s}:N${e}`;
        console.error(`  读取 ${range}...`);
        let csv = callLark("发货订单", range);
        if(!csv) { csv = callLark("发货订单", range); }
        if(!csv) continue;
        const rows = parseCSV(csv);
        all.push(...rows);
        console.error(`  ${rows.length}行, 累计${all.length}`);
    }
    console.error(`总计: ${all.length}行`);

    // Step 2: Dedup by tracking number
    console.error("\nStep 2: 去重并计算...");
    const seen = new Set();
    const est = [];
    for(const {row, fields} of all) {
        if(row===1) continue;
        const tn = (fields[0]||'').trim();
        if(!tn||seen.has(tn)) continue;
        seen.add(tn);
        const courier = (fields[1]||'').trim();
        const store = (fields[2]||'').trim();
        const pl = (fields[3]||'').trim();
        const prov = (fields[4]||'').trim();
        const w = parseFloat((fields[12]||'0').trim())||0;
        const nc = normCourier(courier);
        const fee = calcFee(nc, prov, w);
        est.push({ tn, courier, store, pl, prov, w, nc, fee });
    }
    console.error(`唯一单号: ${est.length}, 有规则: ${est.filter(e=>e.fee!==null).length}`);

    // Step 3: Write header + data CSV
    console.error("\nStep 3: 写入预估表...");
    const csvLines = ['物流单号,配送方式,商店,产品线,省份,理论重量,预估快递费'];
    for(const e of est) {
        csvLines.push(`${escCSV(e.tn)},${escCSV(e.courier)},${escCSV(e.store)},${escCSV(e.pl)},${escCSV(e.prov)},${e.w},${e.fee??''}`);
    }
    const csvPath = path.join(OUT_DIR, 'estimation_data.csv');
    fs.writeFileSync(csvPath, '﻿'+csvLines.join('\n'), 'utf8');
    console.error(`CSV: ${csvLines.length}行, ${(fs.statSync(csvPath).size/1024/1024).toFixed(1)}MB`);

    // Write to sheet via csv-put with @file
    const putCmd = `lark-cli sheets +csv-put --spreadsheet-token "${TOKEN}" --sheet-name "${SHEET}" --start-cell "A1" --csv "@estimation_data.csv" --as user --format json`;
    console.error("  执行写入...");
    try {
        const out = execSync(putCmd, { timeout:300000, encoding:'utf8', maxBuffer:1024*1024, cwd: OUT_DIR });
        const d = JSON.parse(out);
        if(d.ok) console.error(`  写入成功!`);
        else console.error(`  失败: ${JSON.stringify(d.error)}`);
    } catch(e) {
        console.error(`  写入失败: ${e.message}`);
    }

    // Step 4: Summary
    const couriers = {}; let totalFee = 0;
    for(const e of est) {
        const c = e.nc||'未知';
        couriers[c] = (couriers[c]||0)+1;
        if(e.fee!==null) totalFee+=e.fee;
    }
    console.error(`\n=== 统计 ===`);
    for(const [c,n] of Object.entries(couriers).sort()) console.error(`  ${c}: ${n}单`);
    console.error(`预估总费用: ${r(totalFee)}元`);
    console.error(`无规则: ${est.filter(e=>e.fee===null).length}条`);

    // Cleanup
    fs.unlinkSync(csvPath);
    console.error("\n=== 完成 ===");
}

main();
