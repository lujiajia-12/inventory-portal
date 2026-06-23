const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { execSync } = require('child_process');
const config = require('./mail_config.json');

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

(async () => {
    const imap = new ImapFlow({host:config.imap.host,port:config.imap.port,secure:config.imap.tls,auth:{user:config.email,pass:config.password},logger:false});
    await imap.connect();

    // Step 1: Open 马运水 folder
    await imap.mailboxOpen('其他文件夹/马运水');
    console.log(`📂 马运水: ${imap.mailbox.exists}封, 未读:${imap.mailbox.unseen||0}`);

    // Step 2: Fetch unseen
    console.log('\n扫描未读邮件...');
    let found = 0;
    for await (const msg of imap.fetch({unseen:true}, {envelope:true,source:true,flags:true})) {
        found++;
        const flags = msg.flags ? [...msg.flags] : [];
        console.log(`\n🆕 未读邮件:`);
        console.log(`   主题: ${msg.envelope?.subject}`);
        console.log(`   发件: ${msg.envelope?.from?.[0]?.name} <${msg.envelope?.from?.[0]?.address}>`);
        console.log(`   标记: ${flags.join(',')}`);

        // Parse and match
        const parsed = await simpleParser(msg.source.toString());
        const subj = msg.envelope.subject || '';
        const body = parsed.text || '';

        // Load warehouse
        const result = execSync('lark-cli sheets +csv-get --url "https://qau2vw8p0n.feishu.cn/sheets/H86Usi0Y7hRHkit3VhycqGlknXd" --sheet-name "6月仓库渠道数据" --range "A1:O312" --max-chars 500000 --json', {encoding:'utf-8',timeout:30000,maxBuffer:10*1024*1024});
        const data = JSON.parse(result);
        const rows = [];
        const re = /^\[row=(\d+)\] (.*)$/gm;
        let m;
        while ((m = re.exec(data.data.annotated_csv)) !== null) rows.push({row:parseInt(m[1]),line:m[2]});
        const hdr = parseCSVLine(rows[0].line);
        const mailIdx = hdr.indexOf('邮件主题');
        const codeIdx = hdr.indexOf('物料编码');
        const nameIdx = hdr.indexOf('物料名称');

        const subjLower = subj.toLowerCase();
        const bodyLower = body.toLowerCase();
        const combined = subjLower + ' ' + bodyLower;

        console.log('\n   匹配结果:');
        let matched = 0;
        for (let i = 1; i < rows.length; i++) {
            const f = parseCSVLine(rows[i].line);
            const kw = (f[mailIdx] || '').trim();
            if (kw && combined.includes(kw.toLowerCase())) {
                console.log(`   ✅ 行${rows[i].row}: "${kw}" → ${f[codeIdx]} ${(f[nameIdx]||'').substring(0,30)}`);
                matched++;
            }
        }
        console.log(`   共匹配 ${matched} 条记录`);
    }

    if (found === 0) {
        console.log('\n❌ 没有未读邮件！');
        console.log('   请在Foxmail中手动将马运水的一封邮件标记为未读');
    }

    await imap.logout();
})().catch(e => console.error('错误:', e.message));
