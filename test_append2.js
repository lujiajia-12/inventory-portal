const { ImapFlow } = require('imapflow');
const config = require('./mail_config.json');

(async () => {
    const imap = new ImapFlow({host:config.imap.host,port:config.imap.port,secure:config.imap.tls,auth:{user:config.email,pass:config.password},logger:false});
    await imap.connect();
    console.log('已连接');

    // Test with HTML content (like real scenario)
    const html = '<html><body><h1>测试</h1><table><tr><td>数据1</td><td>数据2</td></tr></table><p>这是一封HTML格式的回复草稿</p></body></html>';

    const eml = [
        'From: chuhuocang@70mai.com',
        'To: mayunshui@70mai.com',
        'Subject: =?UTF-8?B?UmU6IOW3qOmBk++8iOmprOi/kOawtO+8iTUuMjjplIDllK7orqLljZU=?=',
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="utf-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        html,
        '',
    ].join('\r\n');

    console.log('尝试 APPEND HTML 草稿...');
    try {
        await imap.append('Drafts', eml, ['\\Draft']);
        console.log('✅ HTML草稿保存成功!');
    } catch(e) {
        console.log('❌ 失败:', e.message);

        // Try without subject encoding
        const eml2 = [
            'From: chuhuocang@70mai.com',
            'To: mayunshui@70mai.com',
            'Subject: Re: 测试草稿',
            `Date: ${new Date().toUTCString()}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset="utf-8"',
            'Content-Transfer-Encoding: 8bit',
            '',
            html,
            '',
        ].join('\r\n');
        console.log('尝试无编码标题...');
        try {
            await imap.append('Drafts', eml2, ['\\Draft']);
            console.log('✅ 简化版成功!');
        } catch(e2) {
            console.log('❌ 简化版也失败:', e2.message);
        }
    }

    await imap.logout();
})().catch(e => console.error(e.message));
