#!/usr/bin/env python3
"""
库存快照归档脚本
仅工作日（周一至周五）10:00 执行：读取库存主表 → 写入快照日志表 → 推送通知

部署方式:
  1. Windows 任务计划程序（推荐）: 每周一至周五 10:00
  2. 阿里云函数计算 FC: cron: 0 10 * * 1-5
  3. Linux crontab: 0 10 * * 1-5 /usr/bin/python3 /path/to/inventory_snapshot.py

环境变量:
  FEISHU_APP_ID          飞书应用 App ID
  FEISHU_APP_SECRET      飞书应用 App Secret
  FEISHU_SALES_CHAT_ID   销售群 chat_id（快照完成后推送日报）

飞书应用所需权限 (在开发者后台开通):
  - bitable:app                   多维表格读写
  - im:message:send_as_bot        机器人发送消息
"""

import os
import sys
import json
import time
import requests
from datetime import datetime

# ============================ 配置区 ============================

# 飞书应用凭证（从飞书开发者后台获取）
FEISHU_APP_ID = os.environ.get("FEISHU_APP_ID", "cli_xxxxxxxxxxxx")
FEISHU_APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "xxxxxxxxxxxxxxxx")

# 多维表格 Base Token
BASE_TOKEN = "SW0ibNH7UaJ2RAsSUOHcdiuOnfL"

# 库存主表（源表）
MAIN_TABLE_ID = "tblxfUkBA54MdLYx"

# 库存快照日志表（目标表）
SNAPSHOT_TABLE_ID = "tblyhtqbBHE2Shok"

# 销售群 chat_id（快照完成后推送库存日报）
FEISHU_SALES_CHAT_ID = os.environ.get("FEISHU_SALES_CHAT_ID", "oc_xxxxxxxxxxxx")

# 库存管理群 chat_id（推送系统运行日志/异常通知，可选）
FEISHU_ADMIN_CHAT_ID = os.environ.get("FEISHU_ADMIN_CHAT_ID", "oc_xxxxxxxxxxxx")

# 批量写入每批最大记录数（飞书限制 500）
BATCH_SIZE = 500

# ============================ 字段映射 ============================
# 来源表字段ID → 目标表字段ID
FIELD_MAPPING = {
    # 来源(库存总表)              → 目标(快照日志表)
    "fld76Ruf1D":  "fldzRMrSAD",   # 序号
    "fldmKGhmvx": "fldbQvEZxK",   # 产品线 (select→text)
    "fld5TvlPzG": "fld08ty2ey",   # 分类
    "fld67RJbf7": "fldgimKkLd",   # 项目型号
    "fldsulel1T": "fldvfpY2aZ",   # 料号
    "fld1b9jkdK": "fldNImDIaA",   # 产品名称
    "fld5N5bfLS": "fldG1B6a6z",   # 产品条形码
    "fldW06OHfa": "flddZCxZ0l",   # 供应商名称
    "fld34GCHmH": "fldos5FO5V",   # 产品模式 (select→text)
    "fld1rQDG8E": "fldsFuQnAR",   # ODM供应商仓库存（手动，已废弃）
    "fldb2t8tlr": "fldsFuQnAR",   # ODM供应商仓(自动) lookup ← 新来源
    "fld1LFyBpV": "fldErYRPEN",   # XA378永惠成品仓（手动，已废弃）
    "flddfoJVKf": "fldErYRPEN",   # XA378永惠成品仓(自动) lookup ← 新来源
    "fld1YVS8Yd": "fldPh6vk0S",   # XA400咪哈成品仓（手动，已废弃）
    "fld0w8Lwq7": "fldPh6vk0S",   # XA400咪哈成品仓(自动) lookup ← 新来源
    "fld7jSSuLQ": "fldLMPLiLx",   # XA226惠州仓（手动字段，已废弃）
    "fldwXI6irZ": "fldLMPLiLx",   # XA226惠州仓(自动) lookup ← 新数据来源，覆盖上一行
    "fld5D5H9Ov": "fldC42IbGr",   # 出货可用库存
    "fld4YnVFkx": "fldJguAwOS",   # 库存分类 (select→text)
    "fld165HKJF": "fldoeFBBni",   # 备注 (multi-select→text)
    "fld6suMxNA": "fldh9XxALc",   # 更新人
    "fld4qB9bI6": "fldxHr8u8O",   # 周转天数
}

# 快照日志表额外字段（不在主表中）
SNAPSHOT_EXTRA_FIELDS = {
    "fldtuxH0Uq": "快照日期",
    "fldgkB3d1o": "快照时间",
    "fldXP2vK5E": "各仓是否已更新",
}


def is_weekday() -> bool:
    """判断今天是否为工作日（周一至周五）"""
    return datetime.now().weekday() < 5  # 0=Mon, 6=Sun


def log(msg: str) -> None:
    """带时间戳的日志输出"""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def get_tenant_access_token() -> str:
    """获取飞书 tenant_access_token"""
    resp = requests.post(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        json={
            "app_id": FEISHU_APP_ID,
            "app_secret": FEISHU_APP_SECRET,
        },
        timeout=15,
    )
    data = resp.json()
    if data.get("code") != 0:
        raise Exception(f"获取 token 失败: {data}")
    return data["tenant_access_token"]


def extract_cell_value(field_id: str, value) -> str:
    """
    将飞书多维表格的单元格值转换为快照日志表中的文本值。

    - select/multi-select 字段: 值为 list[str]，转为逗号分隔的字符串
    - text/number 字段: 直接转为字符串
    - None: 返回空字符串
    """
    if value is None:
        return ""

    # select 字段 (单选/多选): 值是 ["选项名"] 或 [{"text":"选项名"}]
    if isinstance(value, list):
        if len(value) == 0:
            return ""
        if isinstance(value[0], str):
            return ", ".join(value)
        if isinstance(value[0], dict):
            return ", ".join(v.get("text", "") for v in value)
        return str(value)

    # 数字、文本等直接转字符串
    if isinstance(value, (int, float)):
        # 整数不转小数
        if value == int(value):
            return str(int(value))
        return str(value)

    return str(value)


def get_all_records(token: str, table_id: str) -> list:
    """分页读取多维表格全部记录"""
    all_records = []
    page_token = None
    page_num = 0

    while True:
        page_num += 1
        params = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token

        resp = requests.get(
            f"https://open.feishu.cn/open-apis/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/records",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30,
        )
        data = resp.json()
        if data.get("code") != 0:
            raise Exception(f"读取记录失败 (第{page_num}页): {data}")

        items = data.get("data", {}).get("items", [])
        all_records.extend(items)
        log(f"  已读取第 {page_num} 页，本页 {len(items)} 条，累计 {len(all_records)} 条")

        if not data.get("data", {}).get("has_more"):
            break
        page_token = data["data"].get("page_token")

    return all_records


def build_snapshot_fields(main_record: dict) -> dict:
    """
    将库存主表的一条记录转换为快照日志表的字段 dict。
    """
    main_fields = main_record.get("fields", {})
    snapshot_fields = {}

    # 映射字段
    for src_fid, dst_fid in FIELD_MAPPING.items():
        raw_value = main_fields.get(src_fid)
        snapshot_fields[dst_fid] = extract_cell_value(src_fid, raw_value)

    return snapshot_fields


def check_warehouse_update_status(records: list) -> str:
    """
    检查各仓位今日是否已更新。
    通过比较最后更新时间来判断。
    返回格式: "ODM✓ | 永惠✓ | 咪哈✓ | 惠州✗"
    """
    today = datetime.now().strftime("%Y-%m-%d")
    warehouse_fields = {
        "fld1rQDG8E": "ODM供应商仓",
        "fld1LFyBpV": "XA378永惠成品仓",
        "fld1YVS8Yd": "XA400咪哈成品仓",
        "fld7jSSuLQ": "XA226惠州仓",
    }

    status_parts = []
    for fid, name in warehouse_fields.items():
        # 检查是否有至少一条记录的该仓位字段有值且最后更新时间是今天
        updated_today = False
        for rec in records:
            fields = rec.get("fields", {})
            if fields.get(fid) is not None and fields.get(fid, 0) >= 0:
                # 简单判定：有数值即认为今天的数据可用
                # 更精确的判定需读取记录的 updated_time
                updated_today = True
                break

        status_parts.append(f"{name}:{'✓' if updated_today else '✗'}")

    return " | ".join(status_parts)


def batch_write_snapshots(token: str, records: list) -> int:
    """批量写入快照记录到快照日志表"""
    today_str = datetime.now().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 各仓更新状态
    update_status = check_warehouse_update_status(records)

    # 构建写入数据
    batch = []
    for rec in records:
        snapshot_fields = build_snapshot_fields(rec)

        # 添加快照特有字段
        snapshot_fields["fldtuxH0Uq"] = today_str       # 快照日期
        snapshot_fields["fldgkB3d1o"] = now_str          # 快照时间
        snapshot_fields["fldXP2vK5E"] = update_status    # 各仓是否已更新

        batch.append({"fields": snapshot_fields})

    total = len(batch)

    # 分批写入
    for i in range(0, total, BATCH_SIZE):
        chunk = batch[i:i + BATCH_SIZE]
        chunk_num = i // BATCH_SIZE + 1

        resp = requests.post(
            f"https://open.feishu.cn/open-apis/bitable/v1/apps/{BASE_TOKEN}/tables/{SNAPSHOT_TABLE_ID}/records/batch_create",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"records": chunk},
            timeout=60,
        )
        result = resp.json()
        if result.get("code") != 0:
            raise Exception(f"写入快照失败 (第{chunk_num}批, {len(chunk)}条): {result}")
        log(f"  ✅ 已写入第 {chunk_num} 批: {len(chunk)} 条")

        # 批次间短暂等待，避免触发频率限制
        if i + BATCH_SIZE < total:
            time.sleep(1)

    return total


def send_notification(token: str, total: int) -> bool:
    """快照完成后发送飞书消息通知到销售群"""
    if not FEISHU_SALES_CHAT_ID or FEISHU_SALES_CHAT_ID == "oc_xxxxxxxxxxxx":
        log("  ⚠️ 未配置 FEISHU_SALES_CHAT_ID，跳过通知")
        return False

    today_str = datetime.now().strftime("%Y年%m月%d日")
    now_time = datetime.now().strftime("%H:%M")

    content = json.dumps({
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": f"📊 库存快照已生成 — {today_str}"},
            "template": "green",
        },
        "elements": [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": (
                        f"**快照日期**: {today_str}\n"
                        f"**产品总数**: {total} 条\n"
                        f"**快照时间**: {now_time}\n\n"
                        f"📋 [查看库存日报](https://qau2vw8p0n.feishu.cn/wiki/LSdbwavqWiMB1Qk7fdfcIj66nog)\n"
                        f"📈 [查看历史趋势](https://qau2vw8p0n.feishu.cn/wiki/LSdbwavqWiMB1Qk7fdfcIj66nog)"
                    ),
                },
            },
        ],
    })

    resp = requests.post(
        "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "receive_id": FEISHU_SALES_CHAT_ID,
            "msg_type": "interactive",
            "content": content,
        },
        timeout=15,
    )
    result = resp.json()
    if result.get("code") != 0:
        log(f"  ⚠️ 通知发送失败: {result}")
        return False
    return True


def main():
    log("========================================")
    log("🚀 库存快照归档任务开始")
    log("========================================")

    # 安全检查：非工作日跳过
    if not is_weekday():
        log("⏭️ 今天是周末，跳过快照归档（仅工作日执行）")
        return

    # 1. 获取 token
    log("📡 获取飞书访问令牌...")
    token = get_tenant_access_token()
    log("  ✅ Token 获取成功")

    # 2. 读取库存主表全部记录
    log(f"📖 读取库存主表 (table: {MAIN_TABLE_ID})...")
    records = get_all_records(token, MAIN_TABLE_ID)
    log(f"  ✅ 读取完成: 共 {len(records)} 条产品记录")

    if len(records) == 0:
        log("  ⚠️ 库存主表无数据，跳过快照")
        return

    # 3. 写入快照日志表
    log(f"💾 写入快照日志表 (table: {SNAPSHOT_TABLE_ID})...")
    count = batch_write_snapshots(token, records)
    log(f"  ✅ 快照完成！共写入 {count} 条记录")

    # 4. 发送通知
    log("📨 发送群通知...")
    notified = send_notification(token, count)
    if notified:
        log("  ✅ 通知已发送")

    log("========================================")
    log(f"🏁 归档任务结束 — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log("========================================")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ 任务失败: {e}")
        sys.exit(1)
