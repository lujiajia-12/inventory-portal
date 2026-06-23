/**
 * 日报交互卡片模板
 *
 * @param {object} data
 * @param {string} data.date - 日期 'YYYY-MM-DD'
 * @param {number} data.total_questions - 总问题数
 * @param {number} data.unique_clusters - 去重问题簇数
 * @param {Array} data.top_clusters - [{canonical, count, cluster_id}]
 * @param {Array} data.hourly_distribution - 24小时分布
 * @returns {object} 飞书交互卡片 JSON
 */
function dailyCard(data) {
  const { date, total_questions, unique_clusters, top_clusters, hourly_distribution } = data;

  // 高峰期分析
  const peakHour = hourly_distribution
    ? hourly_distribution.indexOf(Math.max(...hourly_distribution))
    : -1;

  // 构建高频问题列表
  const clusterItems = (top_clusters || []).slice(0, 5).map((c, i) => {
    const emoji = i === 0 ? '🔴' : i === 1 ? '🟠' : i === 2 ? '🟡' : i === 3 ? '🟢' : '🔵';
    return `${emoji} **${c.canonical || '其他问题'}**  ——  ${c.count} 次`;
  }).join('\n');

  const mdContent =
`**📅 日期：${date}**
**📊 今日共收到 ${total_questions} 个问题，涉及 ${unique_clusters} 类话题**

${total_questions > 0 ? `**🔥 高频问题 TOP ${Math.min(top_clusters?.length || 0, 5)}：**
${clusterItems}

---` : '今日暂无问题记录 🎉'}

⏰ **提问高峰时段：** ${peakHour >= 0 ? `${peakHour}:00 - ${peakHour + 2}:00` : '无'}
💡 **建议：** 考虑将以上高频问题加入群公告或设置自动回复`;

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `📋 今日高频问题汇总 (${date})` },
      template: total_questions > 10 ? 'red' : total_questions > 5 ? 'orange' : 'blue',
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

module.exports = { dailyCard };
