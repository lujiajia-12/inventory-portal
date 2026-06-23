const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const config = require('./mail_config.json');

(async () => {
    const imap = new ImapFlow({
        host: config.imap.host, port: config.imap.port, secure: config.imap.tls,
        auth: { user: config.email, pass: config.password }, logger: false,
    });
    await imap.connect();

    // Check 马运水 folder - look at ALL recent emails for testing
    await imap.mailboxOpen('其他文件夹/马运水');
    const total = imap.mailbox.exists;
    console.log(`📂 马运水: ${total} 封\n`);

    // Fetch last 3 emails (even if read)
    const start = Math.max(1, total - 2);
    const msgs = [];
    for await (const msg of imap.fetch(`${start}:${total}`, { envelope: true, source: true, flags: true })) {
        msgs.push(msg);
    }

    for (const msg of msgs.reverse()) {
        const subj = msg.envelope?.subject || '';
        const flags = msg.flags || [];
        console.log(`📧 ${flags.includes('\\Seen') ? '已读' : '🆕未读'}: "${subj}"`);

        // Parse and check for matching keywords
        try {
            const p = await simpleParser(msg.source.toString());
            const text = p.text || '';

            // Extract key info
            const codeMatch = text.match(/6839AA\d{6}/g) || [];
            const poMatch = text.match(/2026\d{5,}/g) || [];
            console.log(`   物料编码: ${[...new Set(codeMatch)].join(', ') || '无'}`);
            console.log(`   订单号: ${[...new Set(poMatch)].join(', ') || '无'}`);
        } catch(e) {}
    }

    await imap.logout();
})().catch(e => console.error(e.message));
