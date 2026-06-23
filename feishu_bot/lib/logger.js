/**
 * 日志模块 - 带时间戳的控制台 + 文件日志
 */

const fs = require('fs');
const path = require('path');

let logFile = null;

function init(logPath) {
  logFile = path.resolve(logPath);
  const dir = path.dirname(logFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function timestamp() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function write(level, ...args) {
  const ts = timestamp();
  const msg = [`[${ts}]`, `[${level}]`, ...args].join(' ');
  console.log(msg);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, msg + '\n', 'utf-8');
    } catch (_) {}
  }
}

function info(...args)  { write('INFO', ...args); }
function warn(...args)  { write('WARN', ...args); }
function error(...args) { write('ERROR', ...args); }
function debug(...args) { write('DEBUG', ...args); }

module.exports = { init, info, warn, error, debug };
