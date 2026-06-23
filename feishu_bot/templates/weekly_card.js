/**
 * 周报交互卡片模板
 *
 * @param {object} data
 * @param {string} data.week_label - '2026-W24'
 * @param {number} data.total_questions - 周总问题数
 * @param {number} data.unique_clusters - 去重簇数
 * @param {Array} data.top_clusters - [{canonical, count, cluster_id}]
 * @param {object} data.daily_breakdown - { 'YYYY-MM-DD': count }
 * @param {object} data.previousWeek - 上周统计（可选，用于对比）
 * @returns {object} 飞书交互卡片 JSON
 */
function weeklyCard(data) {
  const { week_label, total_questions, unique_clusters, top_clusters, daily_breakdown, previousWeek } = data;

  // ASCII 柱状图
  const days = Object.entries(daily_breakdown || {}).sort();
  const maxCount = Math.max(...days.map(([, c]) => c), 1);
  const barChart = days.map(([day, count]) => {
    const barLen = Math.round((count / maxCount) * 15);
    const bar = '█'.repeat(barLen) + (count > 0 && barLen === 0 ? '▏' : '');
    const dayLabel = day.slice(5); // MM-DD
    return `${dayLabel}  ${bar} ${count}`;
  }).join('\n');

  // 趋势对比
  let trendLine = '';
  if (previousWeek) {
    const diff = total_questions - (previousWeek.total_questions || 0);
    const pct = previousWeek.total_questions > 0
      ? Math.round((diff / previousWeek.total_questions) * 100)
      : 0;
    const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
    trendLine = `\n📊 **环比上周：** ${arrow} ${diff >= 0 ? '+' : ''}${diff} (${diff >= 0 ? '+' : ''}${pct}%)\n`;
  }

  // Top 10 高频问题
  const clusterItems = (top_clusters || []).slice(0, 10).map((c, i) => {
    const emoji = i === 0 ? '🔴' : i === 1 ? '🟠' : i <= 3 ? '🟡' : i <= 6 ? '🟢' : '🔵';
    return `${emoji} **${c.canonical || '其他问题'}**  ——  ${c.count} 次`;
  }).join('\n');

  const mdContent =
`**📅 周期：${week_label}**

---

**📊 数据总览：**
- 本周总问题数：**${total_questions}**
- 涉及话题类别：**${unique_clusters}**${trendLine}
---

**🔥 高频问题 TOP 10：**
${clusterItems}

---

**📈 每日趋势：**
\`\`\`
${barChart}
\`\`\`

💡 **建议：**
- 高频问题建议补充到群公告或 FAQ 文档
- 关注新增问题趋势，及时安排答疑或培训`;

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `📊 本周高频问题汇总 (${week_label})` },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: mdContent },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: `🤖 Q&A Monitor Bot 自动生成 · ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
          },
        ],
      },
    ],
  };
}

module.exports = { weeklyCard };
