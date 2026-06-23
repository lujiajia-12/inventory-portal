const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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

// Pet TC routes
app.use('/api/pet/package', require('./routes/pet-package'));
app.use('/api/pet/receive', require('./routes/pet-receive'));
app.use('/api/pet/discrepancy', require('./routes/pet-discrepancy'));

// Serve pet frontend
app.use('/pet', express.static(path.join(frontendPath, 'pet')));

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

// Start server — bind to all interfaces so other PCs can access
app.listen(config.port, '0.0.0.0', () => {
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
║  按 Ctrl+C 停止                                  ║
╚══════════════════════════════════════════════════╝
  `);
});
