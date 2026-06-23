#!/usr/bin/env node
/**
 * 快递费用核对分析
 * 1. 分批读取账单和发货订单
 * 2. 按规则计算理论费用
 * 3. 生成差异分析
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TOKEN = "XFHFwuoKEi2m8gkVbK8c88L0nMc";
const OUT_DIR = __dirname;

// ====== 快递计算规则 ======
const RULES = {
    "韵达快递": { firstWeight: 1, firstPrice: 2.8, inProvince: 1.0, outProvince: 1.5, remote: 1.5, opFee: 0.9 },
    "顺丰快递": { firstWeight: 1, firstPrice: 7.0, inProvince: 1.5, outProvince: 3.5, remote: 14.0, opFee: 1.0 },
    "顺丰惠州": { firstWeight: 1, firstPrice: 7.0, inProvince: 1.5, outProvince: 3.5, remote: 14.0, opFee: 1.0 },
};
const REMOTE = new Set(["甘肃省","新疆维吾尔自治区","青海省","内蒙古自治区","西藏自治区"]);

function calcFee(courier, province, weightKg) {
    const rule = RULES[courier] || RULES["韵达快递"];
    if (!weightKg || weightKg <= 0) weightKg = 1;
    if (weightKg <= rule.firstWeight) {
        const fee = rule.firstPrice;
        return { fee: round(fee), total: round(fee + rule.opFee), opFee: rule.opFee };
    }
    const excess = Math.ceil(weightKg - rule.firstWeight);
    let unitPrice;
    if (province === "广东省") unitPrice = rule.inProvince;
    else if (REMOTE.has(province)) unitPrice = rule.remote;
    else unitPrice = rule.outProvince;
    const fee = rule.firstPrice + excess * unitPrice;
    return { fee: round(fee), total: round(fee + rule.opFee), opFee: round(rule.opFee, 1) };
}

function round(v, d = 2) { return Math.round(v * Math.pow(10, d)) / Math.pow(10, d); }

function callLark(sheetName, rangeStr) {
    const cmd = `lark-cli sheets +csv-get --spreadsheet-token "${TOKEN}" --sheet-name "${sheetName}" --range "${rangeStr}" --as user --format json`;
    try {
        const out = execSync(cmd, { timeout: 180000, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        const data = JSON.parse(out);
        if (!data.ok) throw new Error(data.error?.message || 'API error');
        return data.data.annotated_csv;
    } catch (e) {
        console.error(`API error for ${sheetName} ${rangeStr}: ${e.message}`);
        return null;
    }
}

function parseAnnotatedCSV(csv) {
    // Simple parser for annotated CSV format
    const lines = csv.split('\n');
    const rows = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.match(/^\[row=(\d+)\]\s*(.*)/);
        if (!match) continue;
        const rowNum = parseInt(match[1]);
        const content = match[2];
        // Parse CSV content
        const fields = parseCSVLine(content);
        rows.push({ row: rowNum, fields });
    }
    return rows;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

function fetchAll(sheetName, totalRows, lastCol) {
    const allRows = [];
    const batchSize = 3000;
    for (let start = 1; start <= totalRows; start += batchSize) {
        const end = Math.min(start + batchSize - 1, totalRows);
        const rangeStr = `A${start}:${lastCol}${end}`;
        console.error(`  读取 ${sheetName} ${rangeStr}...`);
        let csv = callLark(sheetName, rangeStr);
        if (!csv) {
            console.error(`  重试...`);
            csv = callLark(sheetName, rangeStr);
        }
        if (!csv) { console.error(`  跳过`); continue; }
        const rows = parseAnnotatedCSV(csv);
        allRows.push(...rows);
        console.error(`  获取 ${rows.length} 行, 累计 ${allRows.length}`);
    }
    return allRows;
}

function main() {
    console.error("=== 快递费用核对分析 ===\n");

    // Step 1: Fetch billing
    console.error("Step 1: 读取账单数据...");
    const billRows = fetchAll("账单", 29464, "O");
    console.error(`账单: ${billRows.length} 行`);

    // Step 2: Fetch orders
    console.error("Step 2: 读取发货订单...");
    const orderRows = fetchAll("发货订单", 58008, "N");
    console.error(`发货订单: ${orderRows.length} 行`);

    // Step 3: Build order index
    console.error("Step 3: 建立索引...");
    const orderMap = new Map();
    for (const { row, fields } of orderRows) {
        if (row === 1) continue;
        const trackingNo = (fields[0] || "").trim();
        if (!trackingNo) continue;
        orderMap.set(trackingNo, {
            row, courier: (fields[1]||"").trim(), store: (fields[2]||"").trim(),
            productLine: (fields[3]||"").trim(), province: (fields[4]||"").trim(),
            shipTime: (fields[5]||"").trim(), productName: (fields[6]||"").trim(),
            sku: (fields[7]||"").trim(), qty: (fields[8]||"").trim(),
            unitWeight: (fields[11]||"").trim(), totalWeight: (fields[12]||"").trim(),
            shop: (fields[13]||"").trim()
        });
    }
    console.error(`唯一单号: ${orderMap.size}`);

    // Step 4: Reconcile
    console.error("Step 4: 核对分析...");
    const results = [];
    const stats = { total: 0, matched: 0, notFound: 0, feeMatch: 0, feeDiff: 0 };

    for (const { row, fields } of billRows) {
        if (row === 1) continue;
        if (fields.length < 8) continue;
        const billNo = (fields[1]||"").trim();
        if (!billNo) continue;
        const courier = (fields[2]||"").trim();
        const province = (fields[3]||"").trim();
        const weight = (fields[4]||"").trim();
        const billFee = (fields[5]||"").trim();
        const billOpFee = (fields[6]||"").trim();
        const billAmount = (fields[7]||"").trim();
        const merchant = (fields[8]||"").trim();

        stats.total++;
        const r = { billRow: row, billNo, courier, province, billWeight: weight,
            billFee, billOpFee, billAmount, merchant,
            inOrder: false, orderCourier: "", orderProvince: "", orderWeight: "",
            theoWeight: "", theoFee: "", theoTotal: "", feeDiff: "", weightMatch: "", status: "" };

        const order = orderMap.get(billNo);
        if (order) {
            stats.matched++;
            r.inOrder = true;
            r.orderCourier = order.courier;
            r.orderProvince = order.province;
            r.orderWeight = order.totalWeight;

            const courierForCalc = courier.includes("顺丰") ? "顺丰快递" : courier;
            const w = parseFloat(order.totalWeight) || 0;

            if (RULES[courierForCalc]) {
                const theo = calcFee(courierForCalc, province, w);
                r.theoWeight = String(w);
                r.theoFee = String(theo.fee);
                r.theoTotal = String(theo.total);
                const actual = parseFloat(billAmount) || 0;
                const diff = round(actual - theo.total);
                r.feeDiff = String(diff);
                if (Math.abs(diff) < 0.01) { stats.feeMatch++; r.status = "金额一致"; }
                else { stats.feeDiff++; r.status = `金额差异${diff}元`; }

                const billW = parseFloat(weight) || 0;
                r.weightMatch = Math.abs(billW - w) < 0.001 ? "一致" : `差异(${billW} vs ${w})`;
            } else {
                r.status = `未知快递:${courier}`;
            }
        } else {
            stats.notFound++;
            r.status = "未在发货订单中";
        }
        results.push(r);
    }

    // Step 5: Summary
    console.error(`\n${"=".repeat(60)}`);
    console.error("=== 核对结果汇总 ===");
    console.error(`账单总数: ${stats.total}`);
    console.error(`匹配订单: ${stats.matched}`);
    console.error(`未在订单: ${stats.notFound}`);
    console.error(`金额一致: ${stats.feeMatch}`);
    console.error(`金额差异: ${stats.feeDiff}`);
    console.error(`匹配率: ${round(stats.matched/stats.total*100,1)}%`);

    // Step 6: Write CSV
    const csvPath = path.join(OUT_DIR, "express_analysis_detail.csv");
    const header = "账单行号,单号,快递公司,目的地省,账单重量,账单快递费,账单操作费,账单金额,商家ID,在订单中,订单快递,订单省份,订单重量,理论重量,理论快递费,理论总费用,费用差异,重量匹配,状态\n";
    const lines = [header];
    for (const r of results) {
        lines.push(`${r.billRow},${r.billNo},${r.courier},${r.province},${r.billWeight},${r.billFee},${r.billOpFee},${r.billAmount},${r.merchant},${r.inOrder?"是":"否"},${r.orderCourier},${r.orderProvince},${r.orderWeight},${r.theoWeight},${r.theoFee},${r.theoTotal},${r.feeDiff},${r.weightMatch},${r.status}`);
    }
    fs.writeFileSync(csvPath, "﻿" + lines.join("\n"), "utf8");
    console.error(`\n详细结果: ${csvPath}`);

    // Step 7: Courier breakdown
    console.error("\n=== 快递公司差异 ===");
    const courierStats = {};
    for (const r of results) {
        const c = r.courier || "未知";
        if (!courierStats[c]) courierStats[c] = { total:0, match:0, diff:0, notFound:0, other:0 };
        courierStats[c].total++;
        if (!r.inOrder) courierStats[c].notFound++;
        else if (r.status === "金额一致") courierStats[c].match++;
        else if (r.feeDiff && parseFloat(r.feeDiff) !== 0) courierStats[c].diff++;
        else courierStats[c].other++;
    }
    for (const [c, s] of Object.entries(courierStats).sort()) {
        console.error(`  ${c}: 总计${s.total} 一致${s.match} 差异${s.diff} 未找到${s.notFound}`);
    }

    // Step 8: Top differences
    const diffs = results.filter(r => r.feeDiff && Math.abs(parseFloat(r.feeDiff)) > 0.01)
        .sort((a, b) => Math.abs(parseFloat(b.feeDiff)) - Math.abs(parseFloat(a.feeDiff)));
    console.error("\n=== 金额差异TOP20 ===");
    for (const r of diffs.slice(0, 20)) {
        console.error(`  单号:${r.billNo} ${r.courier} ${r.province} 重量:${r.billWeight} 账单:${r.billAmount} 理论:${r.theoTotal} 差异:${r.feeDiff}`);
    }

    // Step 9: Not found samples
    const notFound = results.filter(r => !r.inOrder);
    console.error(`\n=== 未在订单中的账单 (共${notFound.length}条, 前20) ===`);
    for (const r of notFound.slice(0, 20)) {
        console.error(`  单号:${r.billNo} ${r.courier} ${r.province} 金额:${r.billAmount}`);
    }

    // Step 10: Diff distribution
    const dist = {};
    for (const r of diffs) {
        const d = parseFloat(r.feeDiff);
        let bucket;
        if (d < -5) bucket = "<-5";
        else if (d < -1) bucket = "-5~-1";
        else if (d < -0.1) bucket = "-1~-0.1";
        else if (d <= 0.1) bucket = "-0.1~0.1";
        else if (d <= 1) bucket = "0.1~1";
        else if (d <= 5) bucket = "1~5";
        else bucket = ">5";
        dist[bucket] = (dist[bucket] || 0) + 1;
    }
    console.error("\n=== 差异分布 ===");
    for (const [k, v] of Object.entries(dist).sort()) {
        console.error(`  ${k}: ${v}条`);
    }

    console.error("\n=== 分析完成 ===");
}

main();
