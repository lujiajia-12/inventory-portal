/**
 * 仓库发货邮件自动回复系统
 *
 * 功能：
 * 1. 扫描收件箱 + 发件人专属文件夹中的新邮件
 * 2. 按仓库表"邮件主题"列关键词匹配发货记录
 * 3. 生成回复草稿（人工审核后手动发送）
 *
 * 使用：
 *   node auto_reply.js --once    单次扫描
 *   node auto_reply.js --watch   持续监控
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

// ===================== 配置 =====================

function loadConfig() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'mail_config.json'), 'utf-8'));
}

// ===================== 仓库数据加载 (通过 lark-cli) =====================

function loadWarehouseFromFeishu() {
    try {
        const result = execSync(
            `lark-cli sheets +csv-get --url "https://qau2vw8p0n.feishu.cn/sheets/H86Usi0Y7hRHkit3VhycqGlknXd" --sheet-name "6月仓库渠道数据" --range "A1:O312" --max-chars 500000 --json`,
            { encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
        );
        const data = JSON.parse(result);
        if (!data.ok) throw new Error(data.error?.message || 'API error');
        return parseWarehouseCSV(data.data.annotated_csv);
    } catch (e) {
        console.error('⚠️ lark-cli 读取仓库数据失败: ' + e.message);
        return [];
    }
}

function parseWarehouseCSV(csv) {
    const records = [];
    // Split by logical rows (prefixed with [row=N])
    const rowRegex = /^\[row=(\d+)\] (.*)$/gm;
    const rows = [];
    let match;
    while ((match = rowRegex.exec(csv)) !== null) {
        rows.push({ row: parseInt(match[1]), line: match[2] });
    }

    if (rows.length < 2) return records;

    // Row 1 = headers
    const headerRow = rows[0];
    const headers = parseCSVLine(headerRow.line);
    // Find column indices
    const colChannel = headers.indexOf('渠道');
    const colDate = headers.indexOf('出货日期');
    const colLogistics = headers.indexOf('物流公司');
    const colTracking = headers.indexOf('物流单号');
    const colCustomer = headers.indexOf('收件公司');
    const colEntity = headers.indexOf('出货主体');
    const colMaterialCode = headers.indexOf('物料编码');
    const colMaterialName = headers.indexOf('物料名称');
    const colQty = headers.indexOf('数量');
    const colPO = headers.indexOf('采购订单号');
    const colRemark = headers.indexOf('备注');
    const colType = headers.indexOf('类型');
    const colProductLine = headers.indexOf('产品线');
    const colMailSubject = headers.indexOf('邮件主题'); // NEW column O

    for (let i = 1; i < rows.length; i++) {
        const fields = parseCSVLine(rows[i].line);
        const record = {
            whRow: rows[i].row,
            channel: fields[colChannel] || '',
            date: fields[colDate] || '',
            logistics: fields[colLogistics] || '',
            trackingNo: fields[colTracking] || '',
            customer: fields[colCustomer] || '',
            entity: colEntity >= 0 ? (fields[colEntity] || '') : '',
            materialCode: fields[colMaterialCode] || '',
            materialName: fields[colMaterialName] || '',
            quantity: fields[colQty] || '',
            poNo: colPO >= 0 ? (fields[colPO] || '') : '',
            remark: colRemark >= 0 ? (fields[colRemark] || '') : '',
            type: colType >= 0 ? (fields[colType] || '') : '',
            productLine: colProductLine >= 0 ? (fields[colProductLine] || '') : '',
            mailSubject: colMailSubject >= 0 ? (fields[colMailSubject] || '') : '',
        };
        if (record.materialCode || record.channel) {
            records.push(record);
        }
    }

    console.log(`📦 已加载 ${records.length} 条仓库记录 (含邮件主题: ${records.filter(r => r.mailSubject).length} 条)`);
    return records;
}

function parseCSVLine(line) {
    if (!line) return [];
    const result = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
                else inQuotes = false;
            } else current += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === ',') { result.push(current.trim()); current = ''; }
            else current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

// ===================== 匹配逻辑 =====================

function matchByMailSubject(emailSubject, warehouseData) {
    // Strategy: for each warehouse row that has 邮件主题 filled,
    // check if any keyword from 邮件主题 appears in the email subject
    const subjectLower = (emailSubject || '').toLowerCase();
    const matches = [];

    for (const record of warehouseData) {
        let matched = false;

        // Method 1: exact keyword match from 邮件主题 column
        if (record.mailSubject && subjectLower.includes(record.mailSubject.toLowerCase())) {
            matched = true;
        }

        // Method 2: search for material codes and PO numbers as fallback
        if (!matched && record.materialCode) {
            const code = record.materialCode.toLowerCase();
            if (code.length >= 6 && subjectLower.includes(code)) {
                matched = true;
            }
        }
        if (!matched && record.poNo && record.poNo.length >= 6) {
            if (subjectLower.includes(record.poNo.toLowerCase())) {
                matched = true;
            }
        }
        if (!matched && record.trackingNo && record.trackingNo.length >= 8) {
            if (subjectLower.includes(record.trackingNo.toLowerCase())) {
                matched = true;
            }
        }

        if (matched) {
            matches.push(record);
        }
    }

    return matches;
}

// ===================== HTML 邮件生成 =====================

function generateReplyHTML(originalSubject, matches, senderName) {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    // Group by tracking number for cleaner display
    const grouped = {};
    for (const m of matches) {
        const key = m.trackingNo || m.materialCode;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(m);
    }

    let rows = '';
    for (const [tracking, items] of Object.entries(grouped)) {
        for (const m of items) {
            rows += `<tr>
                <td style="padding:5px 8px;border:1px solid #d0d0d0;font-size:13px;">${m.date || '-'}</td>
                <td style="padding:5px 8px;border:1px solid #d0d0d0;font-size:13px;">${m.logistics || '-'}</td>
                <td style="padding:5px 8px;border:1px solid #d0d0d0;font-size:12px;">${m.trackingNo || '-'}</td>
                <td style="padding:5px 8px;border:1px solid #d0d0d0;font-size:12px;">${m.materialCode || '-'}</td>
                <td style="padding:5px 8px;border:1px solid #d0d0d0;font-size:12px;">${m.materialName || '-'}</td>
                <td style="padding:5px 8px;border:1px solid #d0d0d0;text-align:center;font-size:13px;">${m.quantity || '-'}</td>
                <td style="padding:5px 8px;border:1px solid #d0d0d0;font-size:12px;">${m.customer || '-'}</td>
                <td style="padding:5px 8px;border:1px solid #d0d0d0;font-size:12px;">${m.poNo || '-'}</td>
            </tr>`;
        }
    }

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:'Microsoft YaHei',Arial,sans-serif;font-size:14px;color:#333;">
<p>${senderName ? senderName + ' 您好，' : '您好，'}</p>
<p>关于 <b>"${originalSubject}"</b> 的发货情况如下：</p>
<table style="border-collapse:collapse;width:100%;margin:10px 0;">
<thead><tr style="background:#4472C4;color:#fff;">
<th style="padding:6px 8px;border:1px solid #2B579A;">出货日期</th>
<th style="padding:6px 8px;border:1px solid #2B579A;">物流公司</th>
<th style="padding:6px 8px;border:1px solid #2B579A;">物流单号</th>
<th style="padding:6px 8px;border:1px solid #2B579A;">物料编码</th>
<th style="padding:6px 8px;border:1px solid #2B579A;">物料名称</th>
<th style="padding:6px 8px;border:1px solid #2B579A;">数量</th>
<th style="padding:6px 8px;border:1px solid #2B579A;">收件客户</th>
<th style="padding:6px 8px;border:1px solid #2B579A;">采购订单号</th>
</tr></thead><tbody>${rows}</tbody></table>
<p>以上共 <b>${matches.length}</b> 条发货记录。如有疑问请联系仓库。</p>
<p style="margin-top:20px;font-size:11px;color:#999;">此邮件由仓库发货自动对账系统生成 · ${now}</p>
</body></html>`;
}

// ===================== 草稿保存到 IMAP Drafts =====================

async function saveReplyDraft(imap, parsedEmail, replyHTML, config) {
    const originalSubject = parsedEmail.subject || '';
    const replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;

    // Original recipients
    const originalFrom = parsedEmail.from?.value?.[0] || {};
    const toAddr = originalFrom.address || parsedEmail.from?.text || '';
    const toName = originalFrom.name || '';

    // CC: original CC recipients
    const ccList = (parsedEmail.cc?.value || []).map(c => {
        const addr = c.address || '';
        const name = c.name || '';
        return name ? `"${name}" <${addr}>` : addr;
    }).filter(a => a && !a.includes('chuhuocang')); // exclude self

    const ccStr = ccList.join(', ');

    const fromAddr = config.email;
    const msgId = parsedEmail.messageId || '';
    let refs = parsedEmail.references || '';
    if (msgId && !refs.includes(msgId)) {
        refs = refs ? `${refs} ${msgId}` : msgId;
    }
    const myMsgId = `<${Date.now()}-warehouse@70mai>`;
    const nowStr = new Date().toUTCString();

    // Build simple EML
    const emlLines = [
        `From: ${fromAddr}`,
        `To: ${toName} <${toAddr}>`,
    ];
    if (ccStr) emlLines.push(`Cc: ${ccStr}`);
    emlLines.push(
        `Subject: ${replySubject}`,
        `Date: ${nowStr}`,
        `Message-ID: ${myMsgId}`,
        `In-Reply-To: ${msgId}`,
        `References: ${refs}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="utf-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        replyHTML,
        '',
    );
    const eml = emlLines.join('\r\n');

    console.log(`  📝 保存草稿... (${Buffer.byteLength(eml)} bytes)`);
    try {
        await imap.append('Drafts', eml, ['\\Draft']);
        console.log(`  ✅ 草稿已存 → Drafts 收件:${toName}${ccStr ? ' CC' : ''}`);
        return true;
    } catch (e) {
        console.error(`  ❌ 草稿保存失败: ${e.message}`);
        return false;
    }
}

async function sendDraftToSelf(config, originalSubject, replyHTML, senderName, toAddr) {
    return false; // Deprecated: use saveReplyDraft instead
}

// ===================== UID 追踪 =====================

const PROCESSED_FILE = path.join(__dirname, 'processed_uids.json');

function loadProcessedUids() {
    try { return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8'))); }
    catch (e) { return new Set(); }
}

function saveProcessedUids(uids) {
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...uids], null, 2), 'utf-8');
}

// ===================== 单次扫描 =====================

async function scanAndProcess(config) {
    console.log(`\n🔍 [${new Date().toLocaleTimeString('zh-CN')}] 开始扫描...`);

    const warehouseData = loadWarehouseFromFeishu();
    if (warehouseData.length === 0) {
        console.log('⚠️ 仓库数据为空，跳过处理');
        return;
    }

    const processedUids = loadProcessedUids();
    console.log(`📋 已处理 ${processedUids.size} 封邮件`);

    const imap = new ImapFlow({
        host: config.imap.host, port: config.imap.port, secure: config.imap.tls,
        auth: { user: config.email, pass: config.password }, logger: false,
    });

    try {
        await imap.connect();
        console.log('📡 IMAP 已连接');

        const foldersToCheck = ['INBOX', ...config.senders.map(s => `其他文件夹/${s.name}`).filter(f => f !== '其他文件夹/')];

        // Phase 1: Scan and collect pending replies
        const pendingReplies = [];

        for (const folderName of foldersToCheck) {
            try {
                await imap.mailboxOpen(folderName);
                const total = imap.mailbox.exists;
                if (total === 0) continue;

                const start = Math.max(1, total - 4);
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - 7);
                for await (const msg of imap.fetch(`${start}:${total}`, { envelope: true, source: true })) {
                    if (msg.envelope?.date) {
                        if (new Date(msg.envelope.date) < cutoffDate) continue;
                    }
                    if (processedUids.has(msg.uid)) continue;
                    if (!msg.envelope?.from?.[0]) continue;

                    const fromName = (msg.envelope.from[0].name || '').toLowerCase();
                    const addr = (msg.envelope.from[0].address || '').toLowerCase();
                    const senderMatch = config.senders.find(s => {
                        const sEmail = (s.email || '').toLowerCase();
                        const sName = (s.name || '').toLowerCase();
                        return (sEmail && addr.includes(sEmail)) || (sName && fromName.includes(sName));
                    });
                    if (!senderMatch) continue;

                    const subj = msg.envelope.subject || '';

                    let parsed;
                    try { parsed = await simpleParser(msg.source.toString()); } catch (e) { continue; }

                    const matches = matchByMailSubject(subj, warehouseData);
                    const bodyMatches = matchByMailSubject(parsed.text || '', warehouseData);
                    for (const m of bodyMatches) {
                        if (!matches.find(x => x.whRow === m.whRow)) matches.push(m);
                    }

                    if (matches.length === 0) {
                        processedUids.add(msg.uid);
                        continue;
                    }

                    const replyList = matches.slice(0, 10);
                    const html = generateReplyHTML(subj, replyList, senderMatch.name);

                    pendingReplies.push({
                        uid: msg.uid,
                        folderName,
                        senderName: senderMatch.name,
                        subj,
                        matchesCount: matches.length,
                        replyListCount: replyList.length,
                        parsed,
                        html,
                    });
                }
            } catch (e) { /* folder might not exist */ }
        }

        // Phase 2: Save drafts (outside fetch cursor)
        let totalProcessed = 0;
        for (const reply of pendingReplies) {
            console.log(`\n📧 [${reply.folderName}] ${reply.senderName}: "${reply.subj}"`);
            console.log(`  🎯 匹配 ${reply.matchesCount} 条 (回复${reply.replyListCount}条)`);
            for (const m of reply.replyListCount > 0 ? [] : []) {} // placeholder
            await saveReplyDraft(imap, reply.parsed, reply.html, config);
            processedUids.add(reply.uid);
            totalProcessed++;
        }

        saveProcessedUids(processedUids);
        await imap.logout();
        console.log(`\n✅ 本轮完成，处理 ${totalProcessed} 封新邮件`);

    } catch (e) {
        console.error('❌ 错误: ' + e.message);
        try { await imap.close(); } catch (_) {}
    }
}

// ===================== 主入口 =====================

async function main() {
    const args = process.argv.slice(2);

    console.log('='.repeat(55));
    console.log('📦 仓库发货邮件自动回复系统');
    console.log('='.repeat(55));

    const config = loadConfig();
    console.log(`📧 ${config.email}`);
    console.log(`👤 监控: ${config.senders.map(s=>s.name).join(', ')}`);
    console.log(`📝 模式: ${config.draftMode ? '存草稿(人工审核发送)' : '直接发送'}`);

    if (args.includes('--once')) {
        await scanAndProcess(config);
    } else if (args.includes('--watch')) {
        const interval = (config.pollIntervalMinutes || 10) * 60 * 1000;
        console.log(`⏰ 每 ${config.pollIntervalMinutes} 分钟检查一次\n`);
        await scanAndProcess(config);
        setInterval(() => scanAndProcess(config), interval);
    } else {
        console.log('\n用法:');
        console.log('  node auto_reply.js --once   单次扫描');
        console.log('  node auto_reply.js --watch  持续监控');
    }
}

main().catch(e => { console.error(e.message); process.exit(1); });
