#!/bin/bash
# 群聊消息采集脚本 - 读取群内消息写入Base

BASE="GCdlboeBsaidKFspgbecuNqtnnK"
TABLE="tblCHzgi1bBEGkKY"
GROUP="oc_e70d00c9832a595c1b7089b096328d5d"
TRACK="C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-Claude-code/memory/captured_msgs.json"

echo "=== $(date) 采集 ==="

# 获取最近30条群消息
MSGS=$(lark-cli im +chat-messages-list --chat-id "$GROUP" --as user --page-size 30 --sort desc 2>&1)

# 提取已采集的 message_id
grep -oP 'om_[a-z0-9]+' "$TRACK" 2>/dev/null | sort -u > /tmp/captured.txt

# 处理每条消息
echo "$MSGS" | grep -oP '"message_id": "om_[a-z0-9]+"' | sed 's/"message_id": "//;s/"//' | while read MID; do
  # 跳过已采集
  grep -q "$MID" /tmp/captured.txt 2>/dev/null && continue

  # 获取消息内容
  CONTENT=$(echo "$MSGS" | grep -A1 "$MID" | grep '"content"' | head -1 | sed 's/.*"content": "//;s/",\?$//')

  # 检查是否匹配关键词
  if ! echo "$CONTENT" | grep -qiP '@文利|@阿琼|取出不发|发货视频|核实内容|核实发货|SF|韵达|顺丰|内存卡|发错|漏发'; then
    continue
  fi

  # 提取快递单号 (SF开头或15位数字)
  TN=$(echo "$CONTENT" | grep -oP 'SF[0-9]+|[0-9]{15}' | head -1)
  [ -z "$TN" ] && TN=$(echo "$CONTENT" | grep -oP '[0-9]{12,}' | head -1)

  # 判断请求类型
  if echo "$CONTENT" | grep -q "取出不发"; then
    RT="取出不发"
  elif echo "$CONTENT" | grep -qiP "发货视频|提供.*视频"; then
    RT="提供发货视频"
  elif echo "$CONTENT" | grep -qiP "核实|看下|确认|是不是|有没有|发错|漏发"; then
    RT="核实内容"
  else
    RT="其他"
  fi

  # 判断负责人
  echo "$CONTENT" | grep -q "@文利" && RESP="文利"
  echo "$CONTENT" | grep -q "@阿琼" && RESP="$RESP; 阿琼"
  RESP=$(echo "$RESP" | sed 's/^; //')

  # 获取发消息时间
  MSG_TIME=$(echo "$MSGS" | grep -A5 "$MID" | grep '"create_time"' | head -1 | sed 's/.*"create_time": "//;s/",\?$//')

  # 获取发送人
  SENDER=$(echo "$MSGS" | grep -B20 "$MID" | grep '"name"' | tail -1 | sed 's/.*"name": "//;s/",\?$//')

  echo "  新消息: $TN - $RT - $SENDER"

  # 写入Base
  IDX="$TN - $SENDER"
  [ -z "$TN" ] && IDX="待分类 - $SENDER"

  lark-cli base +record-batch-create --base-token "$BASE" --table-id "$TABLE" \
    --json "{\"fields\":[\"索引\",\"记录ID\",\"快递单号\",\"请求描述\",\"负责人\",\"请求类型\",\"状态\",\"反馈人\",\"原始消息\",\"消息时间\"],\"rows\":[[\"$IDX\",\"$MID\",\"$TN\",\"$CONTENT\",\"$RESP\",\"$RT\",\"待处理\",\"$SENDER\",\"$CONTENT\",\"$MSG_TIME\"]]}" \
    --as user 2>&1 | grep -q ok && echo "  已写入Base" || echo "  写入失败"

  # 记录已采集
  echo "$MID" >> "$TRACK"
  sleep 1
done

echo "=== 完成 ==="