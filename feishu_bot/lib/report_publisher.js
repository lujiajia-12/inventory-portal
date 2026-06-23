/**
 * 报告发布器 - 将报告卡片发送到指定群聊
 */

const feishu = require('./feishu_api');
const logger = require('./logger');

/**
 * 发布报告到所有启用了报告的群聊
 * @param {object} card - 飞书交互卡片 JSON
 * @param {Array} groups - 监控群组配置 [{chat_id, name, send_reports}]
 * @param {string} authMode - 'user' | 'bot'
 * @returns {Promise<Array<{chat_id, name, success, messageId}>>}
 */
async function publishToAllGroups(card, groups, authMode = 'bot') {
  const results = [];
  const targets = groups.filter(g => g.send_reports !== false);

  if (targets.length === 0) {
    logger.warn('没有配置需要发送报告的群组');
    return results;
  }

  for (const group of targets) {
    logger.info(`正在发送报告到: ${group.name} (${group.chat_id})`);
    const result = await feishu.sendCardWithRetry(group.chat_id, card, { authMode });
    results.push({
      chat_id: group.chat_id,
      name: group.name,
      ...result,
    });
  }

  return results;
}

/**
 * 发布日报
 */
async function publishDailyReport(groups, authMode = 'bot') {
  const generator = require('./summary_generator');
  const card = generator.generateDailyReport();
  return publishToAllGroups(card, groups, authMode);
}

/**
 * 发布周报
 */
async function publishWeeklyReport(groups, authMode = 'bot') {
  const generator = require('./summary_generator');
  const card = generator.generateWeeklyReport();
  return publishToAllGroups(card, groups, authMode);
}

module.exports = {
  publishToAllGroups,
  publishDailyReport,
  publishWeeklyReport,
};
