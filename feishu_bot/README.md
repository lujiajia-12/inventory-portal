# 🤖 飞书群聊高频问题监控汇总机器人

自动监听飞书群聊消息，识别提问并聚类统计高频问题，定时生成每日/每周汇总报告。

## 功能

- **消息监听**：定时轮询指定群聊的新消息
- **问题检测**：多维度打分识别提问（问号、疑问词、上下文模式）
- **智能聚类**：基于 LCS + n-gram + 同义词的相似度聚类
- **频率统计**：按日/周统计问题频次和话题分布
- **自动报告**：定时生成交互卡片并发送到群聊

## 快速开始

### 1. 安装依赖

```bash
cd feishu_bot
npm install
```

### 2. 配置飞书应用

1. 前往 [飞书开发者后台](https://open.feishu.cn/app) 创建企业自建应用
2. 添加权限：`im:message:readonly`、`im:message`、`im:chat:readonly`
3. 发布应用并通过管理员审批
4. 将 Bot 添加到目标群聊（群设置 → 群机器人 → 添加机器人）
5. 将 App ID 和 App Secret 填入 `bot_config.json`

### 3. 配置监控群聊

编辑 `bot_config.json`：

```json
{
  "app": {
    "app_id": "cli_xxxxxxxx",
    "app_secret": "xxxxxxxxxxxxx",
    "auth_mode": "user"
  },
  "monitored_groups": [
    {
      "chat_id": "oc_xxxxxxxxxxxxx",
      "name": "工作群",
      "send_reports": true
    }
  ]
}
```

### 4. 运行

```bash
# 单次拉取并分析
node index.js --once

# 持续监控（守护进程）
node index.js --watch

# 立即生成并发送日报
node index.js --report-now

# 立即生成并发送周报
node index.js --report-now --weekly

# 全量重新聚类
node index.js --recluster
```

## 问题检测规则

| 规则 | 分值 | 示例 |
|------|------|------|
| 以 `？` / `?` 结尾 | +30 | "怎么发货？" |
| 中文疑问词 | +30 | 怎么/如何/为什么/什么/哪/谁/吗... |
| 英文疑问词 | +15 | how/why/what/where/when/who... |
| 上下文模式 | +15 | 帮我看下/查一下/确认/麻烦... |

总分 ≥ 30 判定为问题。

## 聚类算法

1. **关键词提取**：字符 n-gram + 领域词加权
2. **相似度计算**：LCS 比例 + bigram Jaccard + 关键词 Jaccard + 类型匹配
3. **同义词支持**：配置 `clustering.synonyms` 实现跨表述匹配
4. **单次聚类**：相似度 ≥ 阈值归入已有簇，否则新建

## 目录结构

```
feishu_bot/
  package.json
  bot_config.json       # 配置文件
  index.js              # 主入口
  lib/
    feishu_api.js       # lark-cli 封装
    data_store.js       # JSON 数据持久化
    logger.js           # 日志
    question_detector.js # 问题检测
    question_cluster.js  # 问题聚类
    frequency_tracker.js # 频率统计
    summary_generator.js # 报告生成
    report_publisher.js  # 报告发布
  templates/
    daily_card.js       # 日报卡片模板
    weekly_card.js      # 周报卡片模板
  data/                 # 运行时数据
```

## 配置说明

完整配置见 `bot_config.json`，关键参数：

- `poll_interval_minutes`：轮询间隔（默认 5 分钟）
- `question_detection.min_score`：问题判定阈值（默认 30）
- `clustering.similarity_threshold`：聚类合并阈值（默认 0.33）
- `clustering.synonyms`：领域同义词（物流↔快递 等）
- `report_schedule.daily.time`：日报发送时间
- `report_schedule.weekly.day/time`：周报发送时间
