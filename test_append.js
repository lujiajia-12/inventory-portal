const { ImapFlow } = require('imapflow');
const config = require('./mail_config.json');

(async () => {
    const imap = new ImapFlow({host:config.imap.host,port:config.imap.port,secure:config.imap.tls,auth:{user:config.email,pass:config.password},logger:false});
    await imap.connect();
    console.log('IMAP已连接');

    // Test 1: Simple append to Drafts
    const now = new Date().toUTCString();
    const eml1 = [
        'From: chuhuocang@70mai.com',
        'To: test@70mai.com',
        'Subject: 测试草稿-简单文本',
        `Date: ${now}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="utf-8"',
        '',
        '这是一封测试草稿，请忽略。',
        '',
    ].join('\r\n');

    try {
        console.log('测试1: 简单文本 APPEND...');
        await imap.append('Drafts', eml1, ['\\Draft']);
        console.log('✅ 测试1成功!');
    } catch(e) {
        console.log('❌ 测试1失败:', e.message);

        // Test 2: Try without flags
        try {
            console.log('测试2: 无flags APPEND...');
            await imap.append('Drafts', eml1);
            console.log('✅ 测试2成功!');
        } catch(e2) {
            console.log('❌ 测试2失败:', e2.message);

            // Test 3: Try INBOX
            try {
                console.log('测试3: APPEND到INBOX...');
                await imap.append('INBOX', eml1);
                console.log('✅ 测试3成功!');
            } catch(e3) {
                console.log('❌ 测试3失败:', e3.message);
                console.log('结论: 该邮箱不支持IMAP APPEND');
            }
        }
    }

    await imap.logout();
})().catch(e => console.error('连接错误:', e.message));
