/**
 * 摘要生成器 - 生成日报/周报
 */

const store = require('./data_store');
const tracker = require('./frequency_tracker');
const cluster = require('./question_cluster');
const { dailyCard } = require('../templates/daily_card');
const { weeklyCard } = require('../templates/weekly_card');

/**
 * 生成日报卡片
 * @param {string} date - 可选，默认昨天
 * @returns {object} 飞书交互卡片 JSON
 */
function generateDailyReport(date = null) {
  const dateKey = date || tracker.yesterdayKey();
  const questions = store.getQuestions();
  const clusters = cluster.getClusters();

  // 更新统计
  const stats = tracker.updateDailyStats(dateKey, questions, clusters);

  const card = dailyCard({
    date: dateKey,
    total_questions: stats.total_questions,
    unique_clusters: stats.unique_clusters,
    top_clusters: stats.top_clusters,
    hourly_distribution: stats.hourly_distribution,
  });

  // 保存报告
  store.saveSummary(`${dateKey}_daily`, { card, stats });

  return card;
}

/**
 * 生成周报卡片
 * @param {string} weekLabel - 可选，默认本周
 * @returns {object} 飞书交互卡片 JSON
 */
function generateWeeklyReport(weekLabel = null) {
  const label = weekLabel || tracker.getWeekLabel();
  const weekKeys = tracker.thisWeekKeys();
  const questions = store.getQuestions();
  const clusters = cluster.getClusters();

  const stats = tracker.updateWeeklyStats(label, weekKeys, questions, clusters);

  // 尝试获取上周数据做对比
  const frequency = store.getFrequency();
  const prevWeekLabel = getPreviousWeekLabel(label);
  const previousWeek = frequency[prevWeekLabel] || null;

  const card = weeklyCard({
    week_label: label,
    total_questions: stats.total_questions,
    unique_clusters: stats.unique_clusters,
    top_clusters: stats.top_clusters,
    daily_breakdown: stats.daily_breakdown,
    previousWeek,
  });

  store.saveSummary(`${label}_weekly`, { card, stats });

  return card;
}

function getPreviousWeekLabel(currentLabel) {
  const match = currentLabel.match(/^(\d{4})-W(\d+)$/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  if (week > 1) {
    return `${year}-W${String(week - 1).padStart(2, '0')}`;
  }
  return `${year - 1}-W52`;
}

module.exports = {
  generateDailyReport,
  generateWeeklyReport,
};
