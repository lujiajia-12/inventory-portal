/**
 * 频率统计模块 - 按日汇总问题频次
 *
 * 统计维度：
 * - 每日问题总数
 * - 每日去重问题数（按簇）
 * - Top 簇排行
 * - 小时分布
 */

const store = require('./data_store');

/**
 * 更新指定日期的统计数据
 * @param {string} dateKey - 'YYYY-MM-DD' 格式
 * @param {Array} questions - 当日的问题列表
 * @param {object} clusters - 当前的簇映射
 */
function updateDailyStats(dateKey, questions, clusters) {
  const frequency = store.getFrequency();

  const dayQuestions = questions.filter(q => toDateKey(q.timestamp) === dateKey);

  if (dayQuestions.length === 0) {
    // 即使无问题也记录
    frequency[dateKey] = {
      total_questions: 0,
      unique_clusters: 0,
      top_clusters: [],
      hourly_distribution: new Array(24).fill(0),
    };
    store.saveFrequency(frequency);
    return frequency[dateKey];
  }

  // 按簇统计
  const clusterCounts = {};
  for (const q of dayQuestions) {
    const cId = q.cluster_id || 'unclustered';
    clusterCounts[cId] = (clusterCounts[cId] || 0) + 1;
  }

  // Top clusters
  const topClusters = Object.entries(clusterCounts)
    .map(([cId, count]) => {
      const cData = clusters[cId] || {};
      return {
        cluster_id: cId,
        canonical: cData.canonical_question || '未分类问题',
        count,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 小时分布
  const hourly = new Array(24).fill(0);
  for (const q of dayQuestions) {
    const hour = new Date(q.timestamp).getHours();
    if (hour >= 0 && hour < 24) hourly[hour]++;
  }

  frequency[dateKey] = {
    total_questions: dayQuestions.length,
    unique_clusters: Object.keys(clusterCounts).length,
    top_clusters: topClusters,
    hourly_distribution: hourly,
    generated_at: new Date().toISOString(),
  };

  store.saveFrequency(frequency);
  return frequency[dateKey];
}

/**
 * 生成周统计
 * @param {string} weekLabel - '2026-W24' 格式
 * @param {string[]} dateKeys - 该周的日期键列表
 */
function updateWeeklyStats(weekLabel, dateKeys, questions, clusters) {
  const frequency = store.getFrequency();
  const weekQuestions = questions.filter(q => dateKeys.includes(toDateKey(q.timestamp)));

  // 按簇统计
  const clusterCounts = {};
  const dailyBreakdown = {};

  for (const dk of dateKeys) {
    const dayQs = weekQuestions.filter(q => toDateKey(q.timestamp) === dk);
    dailyBreakdown[dk] = dayQs.length;
    for (const q of dayQs) {
      const cId = q.cluster_id || 'unclustered';
      clusterCounts[cId] = (clusterCounts[cId] || 0) + 1;
    }
  }

  const topClusters = Object.entries(clusterCounts)
    .map(([cId, count]) => {
      const cData = clusters[cId] || {};
      return {
        cluster_id: cId,
        canonical: cData.canonical_question || '未分类问题',
        count,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  frequency[weekLabel] = {
    total_questions: weekQuestions.length,
    unique_clusters: Object.keys(clusterCounts).length,
    top_clusters: topClusters,
    daily_breakdown: dailyBreakdown,
    generated_at: new Date().toISOString(),
    is_weekly: true,
  };

  store.saveFrequency(frequency);
  return frequency[weekLabel];
}

function toDateKey(timestamp) {
  if (!timestamp) timestamp = Date.now();
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 获取当天的日期键
 */
function todayKey() {
  return toDateKey(Date.now());
}

/**
 * 获取昨天的日期键
 */
function yesterdayKey() {
  return toDateKey(Date.now() - 24 * 60 * 60 * 1000);
}

/**
 * 获取本周的日期键列表
 */
function thisWeekKeys() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const keys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    keys.push(toDateKey(d.getTime()));
  }
  return keys;
}

function getWeekLabel() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

module.exports = {
  updateDailyStats,
  updateWeeklyStats,
  todayKey,
  yesterdayKey,
  thisWeekKeys,
  getWeekLabel,
};
