#!/usr/bin/env node
/**
 * 仓库渠道数据 vs NC系统销售出库 自动对账脚本
 * 匹配逻辑: 物料编码 + 物流单号/快递单号
 */
const fs = require('fs');

function parseAnnotatedCSV(annotatedCsv) {
    const rows = [];
    const lines = annotatedCsv.trim().split('\n');
    let currentRow = null;
    let currentData = '';

    for (const line of lines) {
        const match = line.match(/^\[row=(\d+)\] (.*)/);
        if (match) {
            if (currentRow !== null) {
                rows.push({ row: currentRow, data: currentData });
            }
            currentRow = parseInt(match[1]);
            currentData = match[2];
        } else {
            currentData += '\n' + line;
        }
    }
    if (currentRow !== null) {
        rows.push({ row: currentRow, data: currentData });
    }

    // Parse CSV for each row
    return rows.map(r => {
        const fields = parseCSVLine(r.data);
        return { row: r.row, fields };
    });
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

function parseNumber(str) {
    if (!str || str.trim() === '') return 0;
    const cleaned = str.replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

function main() {
    const warehouseFile = process.env.USERPROFILE + '/.claude/projects/C--Users-Administrator-Desktop-Claude-code/5ac0f536-086a-4e50-9474-cea2f8515324/tool-results/bx9gr2d6o.txt';
    const ncFile = process.env.USERPROFILE + '/.claude/projects/C--Users-Administrator-Desktop-Claude-code/5ac0f536-086a-4e50-9474-cea2f8515324/tool-results/bp32qfusy.txt';

    console.log('Loading warehouse data...');
    const whRaw = JSON.parse(fs.readFileSync(warehouseFile, 'utf-8'));
    const whRows = parseAnnotatedCSV(whRaw.data.annotated_csv);
    console.log(`  Loaded ${whRows.length} rows (including header)`);

    console.log('Loading NC data...');
    const ncRaw = JSON.parse(fs.readFileSync(ncFile, 'utf-8'));
    const ncRows = parseAnnotatedCSV(ncRaw.data.annotated_csv);
    console.log(`  Loaded ${ncRows.length} rows (including header)`);

    // Separate header and data
    const whHeader = whRows[0];
    const whData = whRows.slice(1);
    const ncHeader = ncRows[0];
    const ncData = ncRows.slice(1);

    // Build NC indexes
    // Key: material_code + tracking_no
    const ncIndex = new Map();
    // Key: material_code only
    const ncByMaterial = new Map();

    for (const { row, fields } of ncData) {
        const materialCode = (fields[13] || '').trim();
        const trackingNo = (fields[26] || '').trim();
        const qtyOut1 = (fields[31] || '').trim();
        const qtyOut2 = (fields[32] || '').trim();

        const record = {
            row,
            materialCode,
            materialName: (fields[14] || '').trim(),
            customer: (fields[11] || '').trim(),
            docNo: (fields[5] || '').trim(),
            trackingNo,
            logistics: (fields[25] || '').trim(),
            qtyOut1: parseNumber(qtyOut1),
            qtyOut2: parseNumber(qtyOut2),
            date: (fields[1] || '').trim(),
            rawQty1: qtyOut1,
            rawQty2: qtyOut2,
        };

        const key = `${materialCode}|||${trackingNo}`;
        if (!ncIndex.has(key)) ncIndex.set(key, []);
        ncIndex.get(key).push(record);

        if (!ncByMaterial.has(materialCode)) ncByMaterial.set(materialCode, []);
        ncByMaterial.get(materialCode).push(record);
    }

    console.log(`\nNC index: ${ncIndex.size} unique (material+tracking) keys`);
    console.log(`NC material-only index: ${ncByMaterial.size} unique materials`);

    // Reconciliation
    const results = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    let partialMatchCount = 0;

    for (const { row, fields } of whData) {
        const channel = (fields[0] || '').trim();
        const date = (fields[1] || '').trim();
        const logistics = (fields[2] || '').trim();
        const trackingNo = (fields[3] || '').trim();
        const customer = (fields[4] || '').trim();
        const entity = (fields[5] || '').trim();
        const project = (fields[6] || '').trim();
        const materialCode = (fields[7] || '').trim();
        const materialName = (fields[8] || '').trim();
        const whQtyRaw = (fields[9] || '').trim();
        const poNo = (fields[10] || '').trim();
        const remark = (fields[11] || '').trim();
        const channel2 = (fields[12] || '').trim();
        const productLine = (fields[13] || '').trim();

        const whQty = parseNumber(whQtyRaw);

        const result = {
            whRow: row,
            channel,
            date,
            logistics,
            trackingNo,
            customer,
            materialCode,
            materialName,
            whQty,
            whQtyRaw,
            poNo,
            remark,
            channel2,
            productLine,
            ncMatches: [],
            ncTotalQty: 0,
            matchStatus: '',
            qtyDiff: 0,
        };

        const key = `${materialCode}|||${trackingNo}`;

        if (ncIndex.has(key)) {
            const ncRecords = ncIndex.get(key);
            let ncTotal = 0;
            for (const nc of ncRecords) {
                ncTotal += nc.qtyOut1;
                result.ncMatches.push(nc);
            }
            result.ncTotalQty = ncTotal;
            result.qtyDiff = whQty - ncTotal;

            if (Math.abs(result.qtyDiff) < 0.01) {
                result.matchStatus = '✅ 匹配一致';
                matchedCount++;
            } else {
                result.matchStatus = '⚠️ 数量差异';
                partialMatchCount++;
            }
        } else if (ncByMaterial.has(materialCode)) {
            const ncRecords = ncByMaterial.get(materialCode);
            let ncTotal = 0;
            for (const nc of ncRecords) {
                ncTotal += nc.qtyOut1;
                result.ncMatches.push(nc);
            }
            result.ncTotalQty = ncTotal;
            result.qtyDiff = whQty - ncTotal;

            if (Math.abs(result.qtyDiff) < 0.01) {
                result.matchStatus = '✅ 物料匹配一致(单号不同)';
                matchedCount++;
            } else {
                result.matchStatus = '🔶 物料匹配-数量差异(单号不同)';
                partialMatchCount++;
            }
        } else {
            result.matchStatus = '❌ NC无匹配';
            unmatchedCount++;
        }

        results.push(result);
    }

    // Find NC records not matched
    const matchedNcRows = new Set();
    for (const r of results) {
        for (const nc of r.ncMatches) {
            matchedNcRows.add(nc.row);
        }
    }

    const ncUnmatched = [];
    for (const { row, fields } of ncData) {
        if (!matchedNcRows.has(row)) {
            ncUnmatched.push({
                row,
                materialCode: (fields[13] || '').trim(),
                materialName: (fields[14] || '').trim(),
                customer: (fields[11] || '').trim(),
                docNo: (fields[5] || '').trim(),
                trackingNo: (fields[26] || '').trim(),
                qtyOut1: (fields[31] || '').trim(),
                logistics: (fields[25] || '').trim(),
                date: (fields[1] || '').trim(),
            });
        }
    }

    // Print summary
    console.log(`\n========== 对账结果汇总 ==========`);
    console.log(`仓库发货记录总数: ${results.length}`);
    console.log(`  ✅ 匹配一致: ${matchedCount}`);
    console.log(`  ⚠️ 数量差异: ${partialMatchCount}`);
    console.log(`  ❌ NC无匹配: ${unmatchedCount}`);
    console.log(`NC未匹配记录数: ${ncUnmatched.length}`);

    // Quantity differences
    const diffResults = results.filter(r => r.matchStatus.includes('差异'));
    console.log(`\n========== 数量差异明细 (${diffResults.length}条) ==========`);
    for (const r of diffResults.slice(0, 30)) {
        console.log(`  [${r.materialCode}] ${r.materialName.substring(0, 50)}`);
        console.log(`    仓库: ${r.whQty} | NC: ${r.ncTotalQty} | 差异: ${r.qtyDiff} | 单号: ${r.trackingNo}`);
    }

    // Unmatched warehouse
    const unmatchedWH = results.filter(r => r.matchStatus === '❌ NC无匹配');
    console.log(`\n========== 仓库有但NC无匹配 (${unmatchedWH.length}条) ==========`);
    for (const r of unmatchedWH.slice(0, 20)) {
        console.log(`  [${r.materialCode}] ${r.materialName.substring(0, 50)} | Qty:${r.whQty} | 单号:${r.trackingNo} | ${r.customer}`);
    }

    // Unmatched NC
    console.log(`\n========== NC有但仓库无匹配 (${ncUnmatched.length}条) ==========`);
    for (const r of ncUnmatched.slice(0, 20)) {
        console.log(`  [${r.materialCode}] ${r.materialName.substring(0, 50)} | Qty:${r.qtyOut1} | 单号:${r.trackingNo} | ${r.customer}`);
    }

    // Save JSON output
    const output = {
        summary: {
            warehouseTotal: results.length,
            matched: matchedCount,
            quantityDiff: partialMatchCount,
            unmatched: unmatchedCount,
            ncUnmatched: ncUnmatched.length,
        },
        diffDetails: diffResults.map(r => ({
            materialCode: r.materialCode,
            materialName: r.materialName,
            trackingNo: r.trackingNo,
            customer: r.customer,
            whQty: r.whQty,
            ncQty: r.ncTotalQty,
            diff: r.qtyDiff,
            status: r.matchStatus,
            whRow: r.whRow,
            ncTrackingNos: [...new Set(r.ncMatches.map(n => n.trackingNo))],
            ncDocNos: [...new Set(r.ncMatches.map(n => n.docNo))],
        })),
        unmatchedWarehouse: unmatchedWH.map(r => ({
            materialCode: r.materialCode,
            materialName: r.materialName,
            trackingNo: r.trackingNo,
            logistics: r.logistics,
            customer: r.customer,
            whQty: r.whQty,
            whRow: r.whRow,
        })),
        unmatchedNC: ncUnmatched.map(r => ({
            materialCode: r.materialCode,
            materialName: r.materialName,
            trackingNo: r.trackingNo,
            customer: r.customer,
            ncQty: r.qtyOut1,
            ncRow: r.row,
            docNo: r.docNo,
        })),
    };

    const outputPath = 'C:/Users/Administrator/Desktop/Claude code/reconcile_result.json';
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n详细结果已保存至: ${outputPath}`);

    // Generate CSV for writing to Feishu
    generateReconciliationCSV(results, ncUnmatched);
}

function generateReconciliationCSV(results, ncUnmatched) {
    // Generate the reconciliation sheet content as CSV rows
    const csvRows = [];

    // Section 1: Summary
    csvRows.push(['对账结果汇总']);
    csvRows.push(['项目', '数值']);
    const totalWH = results.length;
    const matched = results.filter(r => r.matchStatus.includes('一致') && !r.matchStatus.includes('差异')).length;
    const qtyDiff = results.filter(r => r.matchStatus.includes('差异')).length;
    const unmatched = results.filter(r => r.matchStatus === '❌ NC无匹配').length;
    csvRows.push(['仓库发货总记录', totalWH]);
    csvRows.push(['匹配一致', matched]);
    csvRows.push(['数量差异', qtyDiff]);
    csvRows.push(['NC无匹配', unmatched]);
    csvRows.push(['NC未匹配记录', ncUnmatched.length]);
    csvRows.push([]);

    // Section 2: Quantity Differences
    csvRows.push(['数量差异明细']);
    csvRows.push(['状态', '渠道', '出货日期', '物料编码', '物料名称', '物流单号', '客户', '仓库数量', 'NC出库数量', '差异', 'NC单号', '仓库行号']);
    const diffResults = results.filter(r => r.matchStatus.includes('差异'));
    for (const r of diffResults) {
        csvRows.push([
            r.matchStatus,
            r.channel,
            r.date,
            r.materialCode,
            r.materialName,
            r.trackingNo,
            r.customer,
            r.whQty,
            r.ncTotalQty,
            r.qtyDiff,
            [...new Set(r.ncMatches.map(n => n.docNo))].join('; '),
            r.whRow,
        ]);
    }
    csvRows.push([]);

    // Section 3: Warehouse unmatched
    csvRows.push(['仓库有但NC无匹配']);
    csvRows.push(['渠道', '出货日期', '物料编码', '物料名称', '物流单号', '物流公司', '客户', '数量', '仓库行号']);
    const unmatchedWH = results.filter(r => r.matchStatus === '❌ NC无匹配');
    for (const r of unmatchedWH) {
        csvRows.push([
            r.channel,
            r.date,
            r.materialCode,
            r.materialName,
            r.trackingNo,
            r.logistics,
            r.customer,
            r.whQty,
            r.whRow,
        ]);
    }
    csvRows.push([]);

    // Section 4: NC unmatched
    csvRows.push(['NC有但仓库无匹配']);
    csvRows.push(['物料编码', '物料名称', '快递单号', '物流公司', '客户', 'NC出库数量', '单据号', 'NC行号']);
    for (const r of ncUnmatched) {
        csvRows.push([
            r.materialCode,
            r.materialName,
            r.trackingNo,
            r.logistics,
            r.customer,
            r.qtyOut1,
            r.docNo,
            r.row,
        ]);
    }

    // Write CSV
    const csvContent = csvRows.map(row =>
        row.map(cell => {
            const str = String(cell);
            // Quote if contains comma, newline, or quote
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(',')
    ).join('\n');

    const csvPath = 'C:/Users/Administrator/Desktop/Claude code/reconcile_output.csv';
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    console.log(`CSV输出已保存至: ${csvPath}`);
    console.log(`CSV行数: ${csvRows.length}`);
}

main();
