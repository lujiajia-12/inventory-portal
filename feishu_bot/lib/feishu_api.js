/**
 * 飞书 API 封装 - 通过 lark-cli 命令行工具调用飞书接口
 *
 * 沿用 capture_messages.sh / send_reply.sh 中的 lark-cli 使用模式。
 * 支持 --as user 和 --as bot 两种鉴权模式。
 */

const { execSync } = require('child_process');
const logger = require('./logger');

const LARK_CLI = 'lark-cli';
const EXEC_TIMEOUT = 30000; // 30s

/**
 * 执行 lark-cli 命令并返回 stdout
 * @param {string} cmd - lark-cli 子命令及参数
 * @param {object} opts
 * @param {string} opts.authMode - 'user' | 'bot'
 * @param {number} opts.timeout - ms
 * @returns {string} stdout
 */
function run(cmd, opts = {}) {
  const authFlag = opts.authMode === 'bot' ? '--as bot' : '--as user';
  const fullCmd = `${LARK_CLI} ${cmd} ${authFlag}`;
  const timeout = opts.timeout || EXEC_TIMEOUT;
  try {
    const stdout = execSync(fullCmd, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 5 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (e) {
    // lark-cli 有时把正常输出写到 stderr
    if (e.stdout) return e.stdout;
    if (e.stderr && e.stderr.includes('"code":0')) return e.stderr;
    logger.error(`lark-cli 执行失败: ${fullCmd}`);
    logger.error(`  ${e.stderr || e.message}`);
    throw e;
  }
}

/**
 * 尝试从 lark-cli 输出中解析 JSON
 * lark-cli 的输出有时混有进度信息，需要提取 JSON 部分
 */
function extractJSON(text) {
  if (!text) return null;
  // 尝试直接解析
  try { return JSON.parse(text); } catch (_) {}
  // 尝试查找 { 开始的 JSON 块
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.substring(start, end + 1)); } catch (_) {}
  }
  return null;
}

// ==================== 消息相关 API ====================

/**
 * 拉取群聊消息列表
 * @param {string} chatId - 群聊 ID
 * @param {object} opts
 * @param {string} opts.authMode - 'user' | 'bot'
 * @param {number} opts.pageSize - 每页数量，默认 50
 * @param {string} opts.pageToken - 分页 token
 * @returns {{ messages: Array, hasMore: boolean, pageToken: string|null }}
 */
function listMessages(chatId, opts = {}) {
  const authMode = opts.authMode || 'user';
  const pageSize = opts.pageSize || 50;
  const sort = opts.sort || 'desc';

  let cmd = `im +chat-messages-list --chat-id "${chatId}" --page-size ${pageSize} --sort ${sort}`;
  if (opts.pageToken) {
    cmd += ` --page-token "${opts.pageToken}"`;
  }

  const stdout = run(cmd, { authMode });
  const data = extractJSON(stdout);

  if (!data) {
    logger.warn('listMessages: 无法解析输出');
    return { messages: [], hasMore: false, pageToken: null };
  }

  const items = data.data?.items || [];
  const hasMore = data.data?.has_more || false;
  const pageToken = data.data?.page_token || null;

  // 解析为统一的消息格式
  const messages = items.map(item => ({
    message_id: item.message_id || '',
    chat_id: item.chat_id || chatId,
    sender_id: item.sender?.id || '',
    sender_name: item.sender?.name || '未知',
    sender_type: item.sender?.sender_type || 'user',
    content: extractTextContent(item.body?.content),
    raw_content: item.body?.content || '',
    msg_type: item.msg_type || '',
    create_time: item.create_time || '',
    timestamp: parseTimestamp(item.create_time),
    is_question: false,
  })).filter(m => m.message_id);

  return { messages, hasMore, pageToken };
}

/**
 * 从飞书消息 content JSON 中提取纯文本
 */
function extractTextContent(contentStr) {
  if (!contentStr) return '';
  try {
    const content = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
    // 递归提取所有 text 字段
    const texts = [];
    function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(walk);
      } else {
        if (obj.text && typeof obj.text === 'string') texts.push(obj.text);
        if (obj.content) {
          if (typeof obj.content === 'string') texts.push(obj.content);
          else if (Array.isArray(obj.content)) obj.content.forEach(walk);
        }
        if (obj.elements) walk(obj.elements);
        if (obj.title) walk([obj.title]);
      }
    }
    walk(content);
    return texts.join(' ').trim();
  } catch (_) {
    return String(contentStr);
  }
}

/**
 * 解析飞书时间戳为毫秒
 */
function parseTimestamp(timeStr) {
  if (!timeStr) return Date.now();
  // 飞书时间格式: "1718123456789" (毫秒) 或 ISO 字符串
  const num = Number(timeStr);
  if (!isNaN(num)) {
    return num > 1e12 ? num : num * 1000;
  }
  const d = new Date(timeStr);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

// ==================== 消息发送 API ====================

/**
 * 发送交互卡片到群聊
 * @param {string} chatId - 群聊 ID
 * @param {object} cardJson - 飞书消息卡片 JSON
 * @param {object} opts
 * @param {string} opts.authMode - 'user' | 'bot'
 * @returns {{ success: boolean, messageId: string|null }}
 */
function sendInteractiveCard(chatId, cardJson, opts = {}) {
  const authMode = opts.authMode || 'bot';
  const contentStr = JSON.stringify(cardJson).replace(/"/g, '\\"');

  const cmd = `im +messages-send --chat-id "${chatId}" --msg-type interactive --content "${contentStr}"`;

  try {
    const stdout = run(cmd, { authMode, timeout: 15000 });
    const data = extractJSON(stdout);
    const messageId = data?.data?.message_id || null;
    if (messageId) {
      logger.info(`卡片发送成功: ${messageId}`);
    }
    return { success: !!messageId, messageId };
  } catch (e) {
    logger.error(`卡片发送失败: ${e.message}`);
    return { success: false, messageId: null };
  }
}

/**
 * 以重试方式发送卡片
 */
async function sendCardWithRetry(chatId, cardJson, opts = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = sendInteractiveCard(chatId, cardJson, opts);
    if (result.success) return result;
    logger.warn(`发送重试 ${attempt}/${maxRetries}`);
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  logger.error(`发送失败，已重试 ${maxRetries} 次`);
  return { success: false, messageId: null };
}

/**
 * 发送文本消息到群聊
 */
function sendTextMessage(chatId, text, opts = {}) {
  const authMode = opts.authMode || 'bot';
  const escaped = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');

  const cmd = `im +messages-send --chat-id "${chatId}" --msg-type text --content "${escaped}"`;

  try {
    const stdout = run(cmd, { authMode, timeout: 15000 });
    const data = extractJSON(stdout);
    return { success: !!(data?.data?.message_id), messageId: data?.data?.message_id || null };
  } catch (e) {
    logger.error(`文本消息发送失败: ${e.message}`);
    return { success: false, messageId: null };
  }
}

// ==================== 群组相关 API ====================

/**
 * 获取群组信息
 */
function getChatInfo(chatId, opts = {}) {
  const authMode = opts.authMode || 'user';
  const stdout = run(`im +chat-get --chat-id "${chatId}"`, { authMode });
  const data = extractJSON(stdout);
  return data?.data || null;
}

module.exports = {
  run,
  extractJSON,
  listMessages,
  extractTextContent,
  sendInteractiveCard,
  sendCardWithRetry,
  sendTextMessage,
  getChatInfo,
};
