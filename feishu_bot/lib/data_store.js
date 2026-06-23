/**
 * 数据持久化模块 - JSON 文件读写（原子写入）
 *
 * 所有数据以 JSON 文件形式存储在 data/ 目录下。
 * 写入采用 .tmp + rename 方式确保原子性。
 */

const fs = require('fs');
const path = require('path');

let DATA_DIR = null;

function init(dataDir) {
  DATA_DIR = path.resolve(dataDir);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  // summaries 子目录
  const summariesDir = path.join(DATA_DIR, 'summaries');
  if (!fs.existsSync(summariesDir)) {
    fs.mkdirSync(summariesDir, { recursive: true });
  }
}

function filePath(name) {
  if (!DATA_DIR) throw new Error('data_store not initialized. Call init() first.');
  return path.join(DATA_DIR, name);
}

/** 读取 JSON 文件，不存在则返回默认值 */
function load(name, defaultValue = null) {
  const fp = filePath(name);
  try {
    if (!fs.existsSync(fp)) return defaultValue;
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[data_store] 读取 ${name} 失败: ${e.message}`);
    return defaultValue;
  }
}

/** 原子写入 JSON 文件 */
function save(name, data) {
  const fp = filePath(name);
  const tmp = fp + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, fp);
  } catch (e) {
    console.error(`[data_store] 写入 ${name} 失败: ${e.message}`);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  }
}

/** 追加元素到数组型 store */
function append(name, item) {
  const arr = load(name, []);
  arr.push(item);
  save(name, arr);
}

/** 批量追加 */
function appendAll(name, items) {
  const arr = load(name, []);
  arr.push(...items);
  save(name, arr);
}

// ---- 专用便捷方法 ----

function getProcessedIds() {
  return new Set(load('processed_ids.json', []));
}

function markProcessed(id) {
  const ids = getProcessedIds();
  if (ids.has(id)) return false;
  ids.add(id);
  save('processed_ids.json', [...ids]);
  return true;
}

function markBatchProcessed(ids) {
  const existing = getProcessedIds();
  let added = 0;
  for (const id of ids) {
    if (!existing.has(id)) {
      existing.add(id);
      added++;
    }
  }
  if (added > 0) {
    save('processed_ids.json', [...existing]);
  }
  return added;
}

function getMessages() {
  return load('messages.json', []);
}

function addMessage(msg) {
  append('messages.json', msg);
}

function addMessages(msgs) {
  appendAll('messages.json', msgs);
}

function getQuestions() {
  return load('questions.json', []);
}

function addQuestion(q) {
  append('questions.json', q);
}

function addQuestions(qs) {
  appendAll('questions.json', qs);
}

function getClusters() {
  return load('clusters.json', {});
}

function saveClusters(clusters) {
  save('clusters.json', clusters);
}

function getFrequency() {
  return load('frequency.json', {});
}

function saveFrequency(freq) {
  save('frequency.json', freq);
}

function saveSummary(dateStr, data) {
  save(path.join('summaries', `${dateStr}.json`), data);
}

/** 清理超过保留期的数据 */
function pruneOldData(retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const messages = getMessages();
  const filtered = messages.filter(m => (m.timestamp || 0) >= cutoff);
  if (filtered.length < messages.length) {
    save('messages.json', filtered);
    console.log(`[data_store] 清理消息: ${messages.length} → ${filtered.length}`);
  }

  const questions = getQuestions();
  const qFiltered = questions.filter(q => (q.timestamp || 0) >= cutoff);
  if (qFiltered.length < questions.length) {
    save('questions.json', qFiltered);
    console.log(`[data_store] 清理问题: ${questions.length} → ${qFiltered.length}`);
  }

  // Clean processed IDs older than retention
  // (simplified: just keep the set; in production would track timestamp per ID)
}

module.exports = {
  init,
  load,
  save,
  append,
  appendAll,
  getProcessedIds,
  markProcessed,
  markBatchProcessed,
  getMessages,
  addMessage,
  addMessages,
  getQuestions,
  addQuestion,
  addQuestions,
  getClusters,
  saveClusters,
  getFrequency,
  saveFrequency,
  saveSummary,
  pruneOldData,
};
