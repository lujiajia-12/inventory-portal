const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request timeout middleware — prevent hanging connections from blocking the server
app.use((req, res, next) => {
  // Set a 30-second timeout on each request socket
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({ ok: false, error: { code: 'REQUEST_TIMEOUT', message: '请求超时' } });
    }
  });
  next();
});

// Serve static frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// API routes
app.use('/api/package', require('./routes/package'));
app.use('/api/receive', require('./routes/receive'));
app.use('/api/discrepancy', require('./routes/discrepancy'));
app.use('/api/reconcile', require('./routes/reconcile'));
app.use('/api/logs', require('./routes/log'));
app.use('/api/update-sn', require('./routes/update-sn'));
app.use('/api/inventory', require('./routes/inventory-push'));
app.use('/api/count', require('./routes/count'));

// Pet TC routes
app.use('/api/pet/package', require('./routes/pet-package'));
app.use('/api/pet/receive', require('./routes/pet-receive'));
app.use('/api/pet/discrepancy', require('./routes/pet-discrepancy'));

// Serve pet frontend
app.use('/pet', express.static(path.join(frontendPath, 'pet')));
// Serve count frontend (warehouse inventory counting)
app.use('/count', express.static(path.join(frontendPath, 'count')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({
    ok: false,
    error: {
      code: 'SERVER_ERROR',
      message: err.message || '服务器内部错误'
    }
  });
});

// ============ 每日库存定时推送 ============

const cron = require('node-cron');
const { pushInventory } = require('./inventory-push');

// 每天早上 10:20 自动推送库存到仓库沟通群
cron.schedule('20 10 * * *', async () => {
  console.log(`[Cron] 定时推送触发 ${new Date().toISOString()}`);
  try {
    const result = await pushInventory();
    console.log(`[Cron] 推送成功 message_id: ${result.messageId}`);
  } catch (e) {
    console.error(`[Cron] 推送失败: ${e.message}`);
  }
}, { timezone: 'Asia/Shanghai' });

console.log('[Cron] 库存推送已注册: 每天 10:20 (北京时间)');

// ============ Process crash protection ============

process.on('uncaughtException', (err) => {
  console.error(`[FATAL] uncaughtException: ${err.message}`);
  console.error(err.stack);
  // Log and exit — a process manager (PM2) should restart the process.
  // We don't attempt to recover because the process may be in an inconsistent state.
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[FATAL] unhandledRejection: ${reason?.message || reason}`);
  if (reason?.stack) console.error(reason.stack);
  // Don't exit immediately — the promise rejection may be handled elsewhere.
  // But log it so we know it happened.
});

process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM received, closing server...');
  server.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 5000);
});

// ============ Start server ============

const server = app.listen(config.port, '0.0.0.0', () => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }

  console.log(`
╔══════════════════════════════════════════════════╗
║  📦 退货收货窗口 - 后端服务                      ║
║  本机访问: http://localhost:${config.port}             ║
║  局域网:   http://${localIP}:${config.port}     ║
║  库存推送: 每天 10:20 → 仓库沟通群                ║
║  按 Ctrl+C 停止                                  ║
╚══════════════════════════════════════════════════╝
  `);
});

// Configure server-level timeouts
server.timeout = 60000;       // 60s socket timeout (default 2min)
server.keepAliveTimeout = 65000; // slightly > timeout to ensure keep-alive works
server.headersTimeout = 66000;  // slightly > keepAliveTimeout (Node 12+)
