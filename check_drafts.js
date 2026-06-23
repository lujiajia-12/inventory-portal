const { ImapFlow } = require('imapflow');
const config = require('./mail_config.json');

(async () => {
    const imap = new ImapFlow({host:config.imap.host,port:config.imap.port,secure:config.imap.tls,auth:{user:config.email,pass:config.password},logger:false});
    await imap.connect();

    // Check Drafts folder
    await imap.mailboxOpen('Drafts');
    console.log(`Drafts: ${imap.mailbox.exists} 封`);

    if (imap.mailbox.exists > 0) {
        const start = Math.max(1, imap.mailbox.exists - 5);
        for await (const msg of imap.fetch(`${start}:${imap.mailbox.exists}`, { envelope: true })) {
            console.log(`  "${msg.envelope?.subject}" → ${msg.envelope?.to?.[0]?.address || '(无)'}`);
        }
    }

    // Also check Sent, INBOX for our test messages
    for (const folder of ['Sent Messages', 'INBOX']) {
        try {
            await imap.mailboxOpen(folder);
            const total = imap.mailbox.exists;
            if (total > 0) {
                // Check last email
                const last = total;
                for await (const msg of imap.fetch(`${last}:${last}`, { envelope: true })) {
                    const subj = msg.envelope?.subject || '';
                    if (subj.includes('测试草稿')) {
                        console.log(`${folder}: "${subj}"`);
                    }
                }
            }
        } catch(e) {}
    }

    await imap.logout();
})().catch(e => console.error(e.message));
