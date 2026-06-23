/**
 * 飞书群聊高频问题监控汇总机器人
 *
 * 功能：
 *   1. 定时轮询群聊消息
 *   2. 自动检测问题并聚类
 *   3. 生成每日/每周高频问题汇总报告
 *   4. 自动发送汇总卡片到群聊
 *
 * 用法：
 *   node index.js --once       单次拉取并分析
 *   node index.js --report-now  立即生成并发送报告
 *   node index.js --watch       持续监控（守护进程）
 *   node index.js --recluster   重新聚类所有历史问题
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ---- 初始化模块 ----

const CONFIG_PATH = path.join(__dirname, 'bot_config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const logger = require('./lib/logger');
const store = require('./lib/data_store');
const feishu = require('./lib/feishu_api');
const detector = require('./lib/question_detector');
const clusterer = require('./lib/question_cluster');
const tracker = require('./lib/frequency_tracker');
const generator = require('./lib/summary_generator');
const publisher = require('./lib/report_publisher');

// 初始化数据目录和日志
store.init(config.data_dir || path.join(__dirname, 'data'));
logger.init(path.join(config.data_dir || path.join(__dirname, 'data'), 'bot.log'));

// 初始化检测器和聚类器
detector.init(config.question_detection);
clusterer.init(config.clustering, store.getClusters());

// ==================== 核心流程 ====================

/**
 * 轮询所有监控群聊的消息
 * @returns {number} 新发现的问题数
 */
async function pollAllGroups() {
  const groups = config.monitored_groups || [];
  if (groups.length === 0) {
    logger.warn('未配置监控群组，请在 bot_config.json 中设置 monitored_groups');
    return 0;
  }

  const authMode = config.app?.auth_mode || 'user';
  let totalNewQuestions = 0;

  for (const group of groups) {
    try {
      logger.info(`📥 拉取群聊消息: ${group.name} (${group.chat_id})`);

      const result = feishu.listMessages(group.chat_id, {
        authMode,
        pageSize: 50,
      });

      if (!result.messages || result.messages.length === 0) {
        logger.info(`  → 无新消息`);
        continue;
      }

      const messages = result.messages;
      logger.info(`  → 获取到 ${messages.length} 条消息`);

      // 去重
      const newMsgs = [];
      for (const msg of messages) {
        if (store.markProcessed(msg.message_id)) {
          newMsgs.push(msg);
        }
      }

      if (newMsgs.length === 0) {
        logger.info(`  → 全部已处理`);
        continue;
      }

      logger.info(`  → 新消息: ${newMsgs.length} 条`);

      // 问题检测
      const questions = [];
      for (const msg of newMsgs) {
        const result = detector.detect(msg.content);

        msg.is_question = result.is_question;
        msg.question_score = result.score;
        msg.question_type = result.question_type;
        msg.keywords = result.keywords;

        if (result.is_question) {
          const q = {
            question_id: `q_${msg.message_id}`,
            message_id: msg.message_id,
            chat_id: msg.chat_id,
            sender_name: msg.sender_name,
            sender_id: msg.sender_id,
            question_text: msg.content,
            question_type: result.question_type,
            timestamp: msg.timestamp,
            cluster_id: null,
            keywords: result.keywords,
            score: result.score,
            matched_patterns: result.matched_patterns,
          };
          questions.push(q);
          logger.info(`  ❓ 检测到问题: [${result.question_type}] "${msg.content.substring(0, 80)}"`);
        }
      }

      // 存储消息
      store.addMessages(newMsgs);

      // 存储问题
      if (questions.length > 0) {
        store.addQuestions(questions);
        totalNewQuestions += questions.length;
      }

      logger.info(`  ✅ ${group.name}: 新消息${newMsgs.length}条, 问题${questions.length}个`);

    } catch (e) {
      logger.error(`轮询失败 ${group.name}: ${e.message}`);
    }
  }

  return totalNewQuestions;
}

/**
 * 运行聚类
 */
function runClustering() {
  const questions = store.getQuestions();

  // 只对未聚类的问题进行聚类
  const unclustered = questions.filter(q => !q.cluster_id);
  if (unclustered.length === 0) {
    logger.info('🔗 聚类: 无新问题需要聚类');
    return;
  }

  logger.info(`🔗 聚类: ${unclustered.length} 个新问题`);
  const updated = clusterer.clusterQuestions(unclustered);

  // 更新 questions.json 中的 cluster_id
  const allQuestions = store.getQuestions();
  for (const q of allQuestions) {
    const cData = updated[q.cluster_id || '__none__'];
    if (!q.cluster_id) {
      // 查找该问题被分配到的簇
      for (const [cId, cData] of Object.entries(updated)) {
        if (cData.question_ids?.includes(q.question_id)) {
          q.cluster_id = cId;
          break;
        }
      }
    }
  }
  store.save('questions.json', allQuestions);

  // 保存聚类结果
  store.saveClusters(updated);

  const clusterCount = Object.keys(updated).length;
  logger.info(`  ✅ 聚类完成: ${clusterCount} 个话题簇`);
}

/**
 * 定时重新聚类（合并漂移）
 */
function runRecluster() {
  logger.info('🔄 全量重新聚类...');
  const questions = store.getQuestions();
  const updated = clusterer.reclusterAll(questions);
  store.saveClusters(updated);

  // 更新 questions 的 cluster_id
  const allQuestions = store.getQuestions();
  for (const q of allQuestions) {
    q.cluster_id = null;
    for (const [cId, cData] of Object.entries(updated)) {
      if (cData.question_ids?.includes(q.question_id)) {
        q.cluster_id = cId;
        break;
      }
    }
  }
  store.save('questions.json', allQuestions);

  logger.info(`  ✅ 重聚类完成: ${Object.keys(updated).length} 个簇`);
}

/**
 * 发送日报
 */
async function sendDailyReport() {
  logger.info('📋 生成日报...');
  try {
    const authMode = config.app?.auth_mode || 'bot';
    const groups = config.monitored_groups || [];
    const results = await publisher.publishDailyReport(groups, authMode);

    for (const r of results) {
      if (r.success) {
        logger.info(`  ✅ 日报已发送到: ${r.name}`);
      } else {
        logger.error(`  ❌ 日报发送失败: ${r.name}`);
      }
    }
  } catch (e) {
    logger.error(`日报发送异常: ${e.message}`);
  }
}

/**
 * 发送周报
 */
async function sendWeeklyReport() {
  logger.info('📊 生成周报...');
  try {
    const authMode = config.app?.auth_mode || 'bot';
    const groups = config.monitored_groups || [];
    const results = await publisher.publishWeeklyReport(groups, authMode);

    for (const r of results) {
      if (r.success) {
        logger.info(`  ✅ 周报已发送到: ${r.name}`);
      } else {
        logger.error(`  ❌ 周报发送失败: ${r.name}`);
      }
    }
  } catch (e) {
    logger.error(`周报发送异常: ${e.message}`);
  }
}

/**
 * 数据清理
 */
function runPrune() {
  const retentionDays = config.data_retention_days || 90;
  logger.info(`🧹 数据清理 (保留 ${retentionDays} 天)...`);
  store.pruneOldData(retentionDays);
}

// ==================== 调度器 ====================

let pollTimer = null;
let clusterTimer = null;
let pruneTimer = null;
let dailyCronJob = null;
let weeklyCronJob = null;

function startScheduler() {
  logger.info('='.repeat(55));
  logger.info('🤖 飞书群聊高频问题监控汇总机器人 启动');
  logger.info('='.repeat(55));
  logger.info(`📋 监控群组: ${(config.monitored_groups || []).map(g => g.name).join(', ') || '无'}`);
  logger.info(`⏱️  轮询间隔: ${config.poll_interval_minutes || 5} 分钟`);
  logger.info(`🔗 聚类间隔: ${config.clustering?.run_interval_minutes || 60} 分钟`);
  logger.info(`📊 日报时间: ${config.report_schedule?.daily?.time || '18:00'}`);
  logger.info(`📈 周报时间: 周${['日','一','二','三','四','五','六'][config.report_schedule?.weekly?.day || 5]} ${config.report_schedule?.weekly?.time || '17:00'}`);

  // 启动时立即执行一次
  logger.info('🚀 执行初始轮询...');
  pollAllGroups().then(count => {
    if (count > 0) {
      logger.info(`初始轮询发现 ${count} 个新问题，立即聚类...`);
      runClustering();
    }
  });

  // 消息轮询定时器
  const pollMs = (config.poll_interval_minutes || 5) * 60 * 1000;
  pollTimer = setInterval(async () => {
    const count = await pollAllGroups();
    if (count > 0) {
      // 有新问题时触发聚类
      runClustering();
    }
  }, pollMs);

  // 聚类定时器
  const clusterMs = (config.clustering?.run_interval_minutes || 60) * 60 * 1000;
  clusterTimer = setInterval(() => {
    runClustering();
  }, clusterMs);

  // 日报 cron
  if (config.report_schedule?.daily?.enabled) {
    const dailyTime = config.report_schedule.daily.time || '18:00';
    const [dh, dm] = dailyTime.split(':').map(Number);
    // node-cron: minute hour * * *
    // 添加随机偏移避免扎堆
    const randMin = (dm + Math.floor(Math.random() * 7)) % 60;
    dailyCronJob = cron.schedule(`${randMin} ${dh} * * *`, () => {
      sendDailyReport();
    });
    logger.info(`📋 日报定时: ${dh}:${String(randMin).padStart(2, '0')} (略有随机偏移)`);
  }

  // 周报 cron
  if (config.report_schedule?.weekly?.enabled) {
    const weeklyDay = config.report_schedule.weekly.day || 5;
    const weeklyTime = config.report_schedule.weekly.time || '17:00';
    const [wh, wm] = weeklyTime.split(':').map(Number);
    const randMin = (wm + Math.floor(Math.random() * 7)) % 60;
    weeklyCronJob = cron.schedule(`${randMin} ${wh} * * ${weeklyDay}`, () => {
      sendWeeklyReport();
    });
    logger.info(`📈 周报定时: 周${['日','一','二','三','四','五','六'][weeklyDay]} ${wh}:${String(randMin).padStart(2, '0')}`);
  }

  // 数据清理 (每天 03:00)
  pruneTimer = setInterval(() => {
    runPrune();
  }, 24 * 60 * 60 * 1000);

  // 也设置 prune cron（更可靠）
  cron.schedule('7 3 * * *', () => {
    runPrune();
  });

  logger.info('✅ 调度器已启动');
  logger.info('按 Ctrl+C 停止...');
}

function stopScheduler() {
  logger.info('正在停止调度器...');
  if (pollTimer) clearInterval(pollTimer);
  if (clusterTimer) clearInterval(clusterTimer);
  if (pruneTimer) clearInterval(pruneTimer);
  if (dailyCronJob) dailyCronJob.stop();
  if (weeklyCronJob) weeklyCronJob.stop();
  logger.info('✅ 已停止');
}

// ==================== CLI 入口 ====================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--once')) {
    logger.info('===== 单次轮询模式 =====');
    const count = await pollAllGroups();
    logger.info(`共发现 ${count} 个新问题`);

    if (count > 0 || args.includes('--force-cluster')) {
      runClustering();
    }

    // 显示当前 Top 聚类
    const top = clusterer.getTopClusters(10);
    if (top.length > 0) {
      logger.info('\n📊 高频问题 Top 10:');
      for (const c of top) {
        logger.info(`  ${c._count}次 - ${c.canonical_question}`);
      }
    }
    process.exit(0);

  } else if (args.includes('--report-now')) {
    logger.info('===== 立即生成报告 =====');

    runClustering(); // 先聚类
    const top = clusterer.getTopClusters(10);
    logger.info(`当前 ${Object.keys(clusterer.getClusters()).length} 个话题簇`);

    const reportType = args.includes('--weekly') ? 'weekly' : 'daily';

    if (reportType === 'weekly') {
      await sendWeeklyReport();
    } else {
      await sendDailyReport();
    }
    process.exit(0);

  } else if (args.includes('--recluster')) {
    logger.info('===== 全量重聚类 =====');
    runRecluster();
    process.exit(0);

  } else if (args.includes('--watch')) {
    // 守护进程模式
    startScheduler();

    // 优雅退出
    process.on('SIGINT', () => {
      stopScheduler();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      stopScheduler();
      process.exit(0);
    });

    // 保持进程运行
    process.stdin.resume();

  } else {
    console.log(`
🤖 飞书群聊高频问题监控汇总机器人

用法:
  node index.js --once         单次拉取消息并检测问题
  node index.js --watch        持续监控模式（守护进程）
  node index.js --report-now   立即生成并发送日报
  node index.js --report-now --weekly  立即生成并发送周报
  node index.js --recluster    全量重新聚类

配置: bot_config.json
    `);
    process.exit(0);
  }
}

main().catch(e => {
  logger.error(`致命错误: ${e.message}`);
  console.error(e);
  process.exit(1);
});
