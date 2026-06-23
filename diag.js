const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { execSync } = require('child_process');
const config = require('./mail_config.json');

function parseCSVLine(line) {
    if (!line) return [];
    const result = [], len = line.length;
    let current = '', inQuotes = false;
    for (let i = 0; i < len; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < len && line[i + 1] === '"') { current += '"'; i++; }
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

(async () => {
    console.log('=== 诊断：邮件自动回复 ===\n');

    // 1. Check IMAP connectivity and folders
    const imap = new ImapFlow({host:config.imap.host,port:config.imap.port,secure:config.imap.tls,auth:{user:config.email,pass:config.password},logger:false});
    await imap.connect();
    console.log('1. IMAP连接: ✅');

    // 2. Check each sender folder
    for (const s of config.senders) {
        if (!s.email) { console.log(`\n   ${s.name}: ⚠️ 未配置邮箱，跳过`); continue; }
        const folderPath = `其他文件夹/${s.name}`;
        try {
            await imap.mailboxOpen(folderPath);
            const mb = imap.mailbox;
            console.log(`\n2. ${s.name} (${folderPath}): ${mb.exists}封`);

            // Check last 3 emails
            const start = Math.max(1, mb.exists - 2);
            const msgs = [];
            for await (const msg of imap.fetch(`${start}:${mb.exists}`, { envelope: true, source: true, flags: true })) {
                msgs.push(msg);
            }
            for (const msg of msgs.reverse()) {
                const flags = new Set(msg.flags || []);
                const unread = !flags.has('\\Seen');
                console.log(`   ${unread ? '🆕' : '  '} 主题:"${msg.envelope?.subject}"`);
                console.log(`      发件:${msg.envelope?.from?.[0]?.name} <${msg.envelope?.from?.[0]?.address}>`);
                if (unread) {
                    try {
                        const p = await simpleParser(msg.source.toString());
                        console.log(`      正文前100字: ${(p.text||'').substring(0,100)}`);
                    } catch(e) {}
                }
            }
        } catch(e) {
            console.log(`\n   ${s.name}: ❌ 文件夹不存在`);
        }
    }

    // 3. Check warehouse data
    console.log('\n\n3. 仓库数据"邮件主题"列内容:');
    try {
        const result = execSync('lark-cli sheets +csv-get --url "https://qau2vw8p0n.feishu.cn/sheets/H86Usi0Y7hRHkit3VhycqGlknXd" --sheet-name "6月仓库渠道数据" --range "A1:O312" --max-chars 500000 --json', {encoding:'utf-8',timeout:30000,maxBuffer:10*1024*1024});
        const data = JSON.parse(result);
        if (!data.ok) throw new Error('API error');

        const rows = [];
        const regex = /^\[row=(\d+)\] (.*)$/gm;
        let m;
        while ((m = regex.exec(data.data.annotated_csv)) !== null) {
            rows.push({row:parseInt(m[1]),line:m[2]});
        }
        if (rows.length > 1) {
            const hdr = parseCSVLine(rows[0].line);
            const mailSubjIdx = hdr.indexOf('邮件主题');
            const matCodeIdx = hdr.indexOf('物料编码');
            const matNameIdx = hdr.indexOf('物料名称');
            const trackingIdx = hdr.indexOf('物流单号');

            let count = 0;
            for (let i = 1; i < rows.length; i++) {
                const f = parseCSVLine(rows[i].line);
                const subject = f[mailSubjIdx] || '';
                if (subject && count < 10) {
                    console.log(`  行${rows[i].row}: 物料=${f[matCodeIdx]} 单号=${f[trackingIdx]} 主题="${subject}"`);
                    count++;
                }
            }
            const total = rows.slice(1).filter(r => {
                const f = parseCSVLine(r.line);
                return f[mailSubjIdx] && f[mailSubjIdx].trim();
            }).length;
            console.log(`  共 ${total} 条已填写邮件主题`);
        }
    } catch(e) {
        console.log('  ❌ 读取失败: ' + e.message);
    }

    // 4. Test matching with 马运水's latest email
    console.log('\n\n4. 匹配测试:');
    try {
        await imap.mailboxOpen('其他文件夹/马运水');
        const last = imap.mailbox.exists;
        const msgs = [];
        for await (const msg of imap.fetch(`${last}:${last}`, { envelope: true, source: true })) {
            msgs.push(msg);
        }
        if (msgs.length > 0) {
            const email = msgs[0];
            const subj = email.envelope?.subject || '';
            console.log(`   邮件主题: "${subj}"`);

            // Reload warehouse
            const result2 = execSync('lark-cli sheets +csv-get --url "https://qau2vw8p0n.feishu.cn/sheets/H86Usi0Y7hRHkit3VhycqGlknXd" --sheet-name "6月仓库渠道数据" --range "A1:O312" --max-chars 500000 --json', {encoding:'utf-8',timeout:30000,maxBuffer:10*1024*1024});
            const d2 = JSON.parse(result2);
            const rows2 = [];
            const re2 = /^\[row=(\d+)\] (.*)$/gm;
            let mm;
            while ((mm = re2.exec(d2.data.annotated_csv)) !== null) rows2.push({row:parseInt(mm[1]),line:mm[2]});

            const hdr2 = parseCSVLine(rows2[0].line);
            const mailSubjIdx2 = hdr2.indexOf('邮件主题');
            const matCodeIdx2 = hdr2.indexOf('物料编码');
            const matNameIdx2 = hdr2.indexOf('物料名称');

            // Check each warehouse record's mailSubject against email subject
            const subjLower = subj.toLowerCase();
            let matched = 0;
            for (let i = 1; i < rows2.length; i++) {
                const f = parseCSVLine(rows2[i].line);
                const kw = (f[mailSubjIdx2] || '').trim();
                if (kw && subjLower.includes(kw.toLowerCase())) {
                    console.log(`   ✅ 匹配! 行${rows2[i].row}: 关键词="${kw}" → 物料=${f[matCodeIdx2]} ${f[matNameIdx2]}`);
                    matched++;
                }
            }
            if (matched === 0) {
                console.log('   ❌ 没有任何仓库记录的"邮件主题"能匹配此邮件');
                console.log('   邮件主题关键词: "' + subj + '"');
                console.log('   请在仓库表中将"邮件主题"列填入能匹配此邮件的关键词');
            }
        }
    } catch(e) {
        console.log('  ❌: ' + e.message);
    }

    await imap.logout();
    console.log('\n=== 诊断完成 ===');
})().catch(e => console.error(e.message));
