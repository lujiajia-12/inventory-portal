#!/bin/bash
# 发货视频回执脚本 - 处理已处理记录

BASE="GCdlboeBsaidKFspgbecuNqtnnK"
TABLE="tblCHzgi1bBEGkKY"
GROUP="oc_e70d00c9832a595c1b7089b096328d5d"
COVER="img_v3_0212f_84cc5014-d513-40ff-8250-e91a6db1e93g"
TRACK="C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-Claude-code/memory/notified_done.json"

echo "=== $(date) 扫描 ==="

# 1. 获取所有record_id
ALL=$(lark-cli base +record-list --base-token "$BASE" --table-id "$TABLE" --as user --limit 200 2>&1)
DONE_IDS=$(echo "$ALL" | grep "已处理" | grep -oP 'recvl[A-Za-z0-9]+' | sort -u)
TRACKED_IDS=$(grep -oP 'recvl[A-Za-z0-9]+' "$TRACK" | sort -u)
NEW=$(comm -23 <(echo "$DONE_IDS") <(echo "$TRACKED_IDS"))

if [ -z "$NEW" ]; then
  echo "无新记录"
  exit 0
fi

echo "新记录: $(echo "$NEW" | wc -l) 条"

# 2. 逐个处理
for RID in $NEW; do
  echo "处理: $RID"

  # 获取详情
  lark-cli base +record-get --base-token "$BASE" --table-id "$TABLE" --record-id "$RID" --as user > /tmp/${RID}.json 2>&1

  # 提取字段 - 从 record-get 的 markdown 输出中解析
  EXP=$(grep '快递单号' /tmp/${RID}.json | head -1 | sed 's/.*快递单号[^:]*: //' | xargs)
  [ -z "$EXP" ] && EXP=$(grep '平台订单号' /tmp/${RID}.json | head -1 | sed 's/.*平台订单号[^:]*: //' | xargs)

  # 请求描述
  DESC=$(grep '请求描述' /tmp/${RID}.json | head -1 | sed 's/.*请求描述[^:]*: //' | xargs)

  # 核实结果
  RSLT=$(grep -oP '(有放|漏发|错发)' /tmp/${RID}.json | head -1)

  # 反馈人
  FB=$(grep '反馈人' /tmp/${RID}.json | head -1 | sed 's/.*反馈人[^:]*: //' | xargs)

  # file_token for video
  FT=$(grep -oP '"file_token":"[^"]*"' /tmp/${RID}.json | head -1 | sed 's/"file_token":"//;s/"//')

  echo "  EXP=$EXP RSLT=$RSLT FB=$FB FT=$FT"

  # 3. 下载+发视频
  if [ -n "$FT" ]; then
    lark-cli base +record-download-attachment --base-token "$BASE" --table-id "$TABLE" --record-id "$RID" --file-token "$FT" --output "./v_${RID}.mp4" --as user 2>&1 | grep -q ok && echo "  视频下载OK"
    lark-cli im +messages-send --chat-id "$GROUP" --video "./v_${RID}.mp4" --video-cover "$COVER" --as bot 2>&1 | grep -q message_id && echo "  视频发送OK"
    rm -f "./v_${RID}.mp4"
  fi

  # 4. 搜索反馈人open_id
  UID=$(lark-cli contact +search-user --query "$FB" --as user 2>&1 | grep -oP '"open_id":\s*"\K[^"]*' | head -1)

  # 5. emoji
  case "$RSLT" in
    有放) EMOJI="🟢**有放**" ;;
    漏发) EMOJI="🔴**漏发**" ;;
    错发) EMOJI="🟠**错发**" ;;
    *) EMOJI="**${RSLT}**" ;;
  esac

  # 6. 发卡片
  if [ -n "$UID" ]; then
    CARD="<at id=${UID}></at> 您反馈的请求已处理完成：\n\n**快递单号：** ${EXP}\n**请求描述：** ${DESC}\n**核实结果：** ${EMOJI}\n\n**处理人：** 文利"
  else
    CARD="**反馈人：** ${FB}\n\n上述请求已处理完成：\n\n**快递单号：** ${EXP}\n**请求描述：** ${DESC}\n**核实结果：** ${EMOJI}\n\n**处理人：** 文利"
  fi

  lark-cli im +messages-send --chat-id "$GROUP" --msg-type interactive --as bot --content "{\"config\":{\"wide_screen_mode\":true},\"header\":{\"title\":{\"tag\":\"plain_text\",\"content\":\"✅ 发货核实已完成\"},\"template\":\"green\"},\"elements\":[{\"tag\":\"div\",\"text\":{\"tag\":\"lark_md\",\"content\":\"${CARD}\"}}]}" 2>&1 | grep -q message_id && echo "  卡片发送OK"

  # 7. 更新追踪
  sed -i 's/]$/,"'$RID'"]/' "$TRACK"
  echo "  追踪更新OK"

  sleep 2
  rm -f /tmp/${RID}.json
done

echo "=== 完成 ==="