const { ImapFlow } = require('imapflow');
const config = require('./mail_config.json');

(async () => {
    const imap = new ImapFlow({host:config.imap.host,port:config.imap.port,secure:config.imap.tls,auth:{user:config.email,pass:config.password},logger:false});
    await imap.connect();

    // Check Drafts
    await imap.mailboxOpen('Drafts');
    const total = imap.mailbox.exists;
    console.log(`📝 草稿箱: ${total} 封`);

    if (total > 0) {
        const start = Math.max(1, total - 2);
        for await (const msg of imap.fetch(`${start}:${total}`, { envelope: true })) {
            console.log(`  主题: ${msg.envelope?.subject}`);
            console.log(`  收件人: ${msg.envelope?.to?.[0]?.address || '未知'}`);
            console.log(`  时间: ${msg.envelope?.date}`);
            console.log('');
        }
    }

    await imap.logout();
})().catch(e => console.error(e.message));
