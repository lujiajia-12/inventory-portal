/**
 * Feishu API client using lark-cli for Base operations.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

const LARK_CLI = 'lark-cli';

// Cache field name → field_id mapping
let _fieldMap = null; // { fieldId: fieldName, fieldName: fieldId }

/**
 * Write JSON payload to a temp file and run lark-cli with --json @file.
 * This avoids shell escaping issues with Chinese characters and special chars.
 */
function runWithJson(cmdPrefix, jsonObj) {
  const tmpFile = `_lark_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(jsonObj), 'utf-8');
    const fullCmd = `${cmdPrefix} --json @${tmpFile}`;
    return run(fullCmd);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

/**
 * Escape a string for safe use in double-quoted shell arguments.
 */
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Run a lark-cli command and return parsed JSON data.
 */
function run(args) {
  const cmd = `${LARK_CLI} ${args} --as user --format json`;
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) throw new Error('No JSON in output');
    const result = JSON.parse(stdout.slice(jsonStart));
    if (!result.ok) throw new Error(result.error?.message || 'lark-cli error');
    return result.data;
  } catch (e) {
    if (e.message?.includes('lark-cli error')) throw e;
    throw new Error(`lark-cli failed: ${e.message}`);
  }
}

/**
 * Load and cache field_id <-> field_name mapping from the table.
 */
function getFieldMap() {
  if (_fieldMap) return _fieldMap;

  const baseArg = `--base-token ${config.baseToken}`;
  const tableArg = `--table-id ${config.tableId}`;
  const data = run(`base +field-list ${baseArg} ${tableArg}`);

  _fieldMap = {};
  for (const f of (data.fields || data || [])) {
    _fieldMap[f.id] = f.name;
    _fieldMap[f.name] = f.id;
  }
  return _fieldMap;
}

/**
 * Extract a value from the JSON array format.
 * Select fields are wrapped in arrays, text fields are strings.
 */
function extractValue(val) {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return val.length > 0 ? String(val[0]) : '';
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val;
  return String(val);
}

/**
 * Search records by tracking number (运单号).
 * Returns array of formatted record objects.
 */
function searchByTracking(trackingNumber) {
  const baseArg = `--base-token ${config.baseToken}`;
  const tableArg = `--table-id ${config.tableId}`;
  const fieldMap = getFieldMap();

  const data = run(
    `base +record-search ${baseArg} ${tableArg} ` +
    `--keyword "${esc(trackingNumber)}" --search-field ${config.fields.trackingNumber} --limit 200`
  );

  const rows = data.data || [];
  const fieldIdList = data.field_id_list || [];
  const recordIdList = data.record_id_list || [];

  // Build index→fieldName map from field_id_list + fieldMap
  const indexToField = fieldIdList.map(fid => fieldMap[fid] || fid);

  return rows.map((row, i) => {
    const item = {
      recordId: recordIdList[i] || '',
    };
    // Map each array element to its field name
    for (let j = 0; j < row.length && j < indexToField.length; j++) {
      const fieldName = indexToField[j];
      const rawVal = row[j];
      let val = extractValue(rawVal);

      // Ensure checkbox fields are boolean
      if (['收货确认', '少件', '错件', '破损', '空包裹'].includes(fieldName)) {
        val = val === true || val === 'true' || val === 'True';
      }

      item[fieldName] = val;
    }
    return item;
  });
}

/**
 * Batch update records — confirm receipt.
 */
function batchConfirmReceive(recordIds) {
  if (!recordIds || recordIds.length === 0) {
    throw new Error('未提供要确认的记录');
  }

  const baseArg = `--base-token ${config.baseToken}`;
  const tableArg = `--table-id ${config.tableId}`;
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);

  let updatedCount = 0;
  for (const rid of recordIds) {
    try {
      const fields = {
        [config.fields.receiveConfirm]: true,
        [config.fields.receiveStatus]: '收货正常',
        [config.fields.receiveTime]: now,
      };
      const cmd = `base +record-upsert ${baseArg} ${tableArg} --record-id "${esc(rid)}"`;
      runWithJson(cmd, fields);
      updatedCount++;
    } catch (e) {
      console.error(`Failed to update record ${rid}: ${e.message}`);
    }
  }

  return { updatedCount };
}

/**
 * Mark a record with discrepancy flags.
 */
function markDiscrepancy(recordId, flags, note) {
  if (!recordId) throw new Error('未提供记录ID');

  const baseArg = `--base-token ${config.baseToken}`;
  const tableArg = `--table-id ${config.tableId}`;
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);

  const fieldValues = {
    [config.fields.receiveStatus]: '收货异常',
    [config.fields.receiveTime]: now,
  };

  if (flags['少件']) fieldValues[config.fields.lessItem] = true;
  if (flags['错件']) fieldValues[config.fields.wrongItem] = true;
  if (flags['破损']) fieldValues[config.fields.damaged] = true;
  if (flags['空包裹']) fieldValues[config.fields.emptyPackage] = true;

  if (note) fieldValues[config.fields.discrepancyNote] = note;

  const reasons = [];
  if (flags['少件']) reasons.push('少件');
  if (flags['错件']) reasons.push('错件');
  if (flags['破损']) reasons.push('破损');
  if (flags['空包裹']) reasons.push('空包裹');
  if (reasons.length === 0) reasons.push(note || '其他');
  fieldValues[config.fields.discrepancyReason] = reasons.join('/');

  const cmd = `base +record-upsert ${baseArg} ${tableArg} --record-id "${esc(recordId)}"`;
  runWithJson(cmd, fieldValues);

  return { success: true, recordId };
}

/**
 * Write an operation log entry to the log table.
 */
function writeLog(trackingNumber, opType, count, detail) {
  const logTableId = config.logTableId;
  if (!logTableId) return;
  try {
    const baseArg = `--base-token ${config.baseToken}`;
    const tableArg = `--table-id ${logTableId}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const fields = {
      '操作时间': now,
      '运单号': trackingNumber,
      '操作类型': opType,
      '记录数': count,
      '详情': detail || '',
    };
    const cmd = `base +record-upsert ${baseArg} ${tableArg}`;
    runWithJson(cmd, fields);
  } catch (e) {
    console.error('[Log] Failed:', e.message);
  }
}

/**
 * Read recent operation logs.
 */
function getRecentLogs(limit = 30) {
  const logTableId = config.logTableId;
  if (!logTableId) return [];
  try {
    const baseArg = `--base-token ${config.baseToken}`;
    const tableArg = `--table-id ${logTableId}`;
    const data = run(`base +record-list ${baseArg} ${tableArg} --limit ${limit}`);

    const rows = data.data || [];
    const fids = data.field_id_list || [];
    const rids = data.record_id_list || [];

    // Get field names
    const fieldData = run(`base +field-list ${baseArg} ${tableArg}`);
    const idToName = {};
    for (const f of (fieldData.fields || fieldData || [])) idToName[f.id] = f.name;

    return rows.map((row, i) => {
      const rec = {};
      for (let j = 0; j < row.length && j < fids.length; j++) {
        const name = idToName[fids[j]] || fids[j];
        let v = row[j];
        if (Array.isArray(v)) v = v.length > 0 ? String(v[0]) : '';
        if (v === null || v === undefined) v = '';
        rec[name] = v;
      }
      return rec;
    });
  } catch (e) {
    console.error('[Log] Read failed:', e.message);
    return [];
  }
}

module.exports = {
  searchByTracking,
  batchConfirmReceive,
  markDiscrepancy,
  writeLog,
  getRecentLogs,
};
