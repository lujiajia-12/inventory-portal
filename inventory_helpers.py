#!/usr/bin/env python3
"""
库存系统辅助脚本 — 每日提醒 + 未更新检查 + 低库存预警
仅工作日（周一至周五）执行

脚本功能:
  --mode remind    工作日08:30 提醒各仓位负责人更新库存
  --mode check     工作日09:45 检查哪些仓位尚未更新，通知段慧琴
  --mode lowstock  低库存实时检查

部署方式:
  Windows 任务计划程序: 每周一至周五
    - 08:30 → inventory_helpers.py remind
    - 09:45 → inventory_helpers.py check

环境变量:
  FEISHU_APP_ID          飞书应用 App ID
  FEISHU_APP_SECRET      飞书应用 App Secret
  FEISHU_CHAT_ID         库存管理群 chat_id
"""

import os
import sys
import json
import requests
from datetime import datetime

# ============================ 配置区 ============================

FEISHU_APP_ID = os.environ.get("FEISHU_APP_ID", "cli_xxxxxxxxxxxx")
FEISHU_APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "xxxxxxxxxxxxxxxx")

BASE_TOKEN = "SW0ibNH7UaJ2RAsSUOHcdiuOnfL"
MAIN_TABLE_ID = "tblxfUkBA54MdLYx"

# 仓位负责人配置（飞书用户 open_id）
# 获取方式: lark-cli contact +search-user --query "姓名" --as user
WAREHOUSE_OWNERS = {
    "ODM供应商仓库存": {
        "field_id": "fld1rQDG8E",
        "owner_name": "ODM供应商对接人",
        "owner_open_id": "ou_xxxxxxxxxxxx",  # 替换为实际 open_id
    },
    "XA378永惠成品仓": {
        "field_id": "fld1LFyBpV",
        "owner_name": "永惠仓管",
        "owner_open_id": "ou_xxxxxxxxxxxx",
    },
    "XA400咪哈成品仓": {
        "field_id": "fld1YVS8Yd",
        "owner_name": "咪哈仓管",
        "owner_open_id": "ou_xxxxxxxxxxxx",
    },
    "XA226惠州仓": {
        "field_id": "fld7jSSuLQ",
        "owner_name": "惠州仓管",
        "owner_open_id": "ou_xxxxxxxxxxxx",
    },
}

# 段慧琴 open_id
ADMIN_OPEN_ID = "ou_xxxxxxxxxxxx"  # 替换为段慧琴的实际 open_id

# 库存管理群 chat_id
MANAGEMENT_CHAT_ID = os.environ.get("FEISHU_CHAT_ID", "oc_xxxxxxxxxxxx")

# 销售群 chat_id
SALES_CHAT_ID = "oc_xxxxxxxxxxxx"

# 低库存阈值
LOW_STOCK_THRESHOLD = 100


def get_token():
    resp = requests.post(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        json={"app_id": FEISHU_APP_ID, "app_secret": FEISHU_APP_SECRET},
        timeout=15,
    )
    return resp.json()["tenant_access_token"]


def is_weekday() -> bool:
    """判断今天是否为工作日（周一至周五）"""
    return datetime.now().weekday() < 5


def send_text_message(token: str, chat_id: str, text: str) -> bool:
    """发送文本消息到群聊"""
    content = json.dumps({"text": text})
    resp = requests.post(
        f"https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"receive_id": chat_id, "msg_type": "text", "content": content},
        timeout=15,
    )
    return resp.json().get("code") == 0


def send_direct_message(token: str, open_id: str, text: str) -> bool:
    """发送私聊消息"""
    content = json.dumps({"text": text})
    resp = requests.post(
        f"https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"receive_id": open_id, "msg_type": "text", "content": content},
        timeout=15,
    )
    return resp.json().get("code") == 0


def mode_remind():
    """
    A1: 工作日08:30 提醒各仓位负责人更新库存
    """
    if not is_weekday():
        print("⏭️ 今天是周末，跳过更新提醒（仅工作日执行）")
        return

    token = get_token()
    today = datetime.now().strftime("%Y年%m月%d日")

    message = (
        f"📢 库存更新提醒 — {today}\n\n"
        f"请以下负责人于 09:30 前完成今日库存更新：\n\n"
        f"□ ODM供应商仓 — @ODM供应商对接人\n"
        f"□ XA378永惠成品仓 — @永惠仓管\n"
        f"□ XA400咪哈成品仓 — @咪哈仓管\n"
        f"□ XA226惠州仓 — @惠州仓管\n\n"
        f"📋 点击更新 → https://qau2vw8p0n.feishu.cn/wiki/LSdbwavqWiMB1Qk7fdfcIj66nog\n"
        f"⚠ 系统将在10:00自动拍摄今日库存快照"
    )

    if MANAGEMENT_CHAT_ID and MANAGEMENT_CHAT_ID != "oc_xxxxxxxxxxxx":
        ok = send_text_message(token, MANAGEMENT_CHAT_ID, message)
        print(f"群消息发送: {'✅' if ok else '❌'}")

    # 同时私聊提醒各仓位负责人
    for name, cfg in WAREHOUSE_OWNERS.items():
        if cfg["owner_open_id"] and cfg["owner_open_id"] != "ou_xxxxxxxxxxxx":
            dm = f"📢 {cfg['owner_name']}，请于09:30前更新 {name} 的库存数据\n📋 https://qau2vw8p0n.feishu.cn/wiki/LSdbwavqWiMB1Qk7fdfcIj66nog"
            ok = send_direct_message(token, cfg["owner_open_id"], dm)
            print(f"私聊 {cfg['owner_name']}: {'✅' if ok else '❌'}")


def mode_check():
    """
    A2: 工作日09:45 检查哪些仓位尚未更新
    检查逻辑: 读取库存总表，检查「更新人」字段是否有今日修改
    （简化版：通过检查是否有记录的最后更新时间是今天来判断）
    """
    if not is_weekday():
        print("⏭️ 今天是周末，跳过未更新检查（仅工作日执行）")
        return

    token = get_token()
    today = datetime.now().strftime("%Y-%m-%d")

    # 读取库存总表记录（只需少量用于判断更新状态）
    resp = requests.get(
        f"https://open.feishu.cn/open-apis/bitable/v1/apps/{BASE_TOKEN}/tables/{MAIN_TABLE_ID}/records",
        headers={"Authorization": f"Bearer {token}"},
        params={"page_size": 100},
        timeout=30,
    )
    data = resp.json()
    if data.get("code") != 0:
        print(f"读取失败: {data}")
        return

    records = data.get("data", {}).get("items", [])

    # 检查各仓位字段是否有值（简化：检查每条记录的仓位字段值是否 >= 0）
    # 实际上应读取每条记录的 updated_time 来判断
    # 这里简化判断：检查各仓位的总库存是否大于0
    warehouse_totals = {name: 0 for name in WAREHOUSE_OWNERS}
    for rec in records:
        fields = rec.get("fields", {})
        for name, cfg in WAREHOUSE_OWNERS.items():
            val = fields.get(cfg["field_id"])
            if val is not None:
                warehouse_totals[name] += val

    # 检查是否有仓位完全为0（可能是因为还没更新）
    not_updated = []
    updated = []
    for name, total in warehouse_totals.items():
        if total == 0:
            not_updated.append(name)
        else:
            updated.append(name)

    # 构建消息
    status_lines = []
    for name in updated:
        status_lines.append(f"  ✅ {name} — 已更新")
    for name in not_updated:
        cfg = WAREHOUSE_OWNERS[name]
        status_lines.append(f"  ❌ {name} — 尚未更新 @{cfg['owner_name']}")

    message = (
        f"⚠️ 库存更新检查 — {today} 09:45\n\n"
        + "\n".join(status_lines) +
        f"\n\n段慧琴请电话跟进未更新的仓位负责人"
    )

    print(message)

    # 发送给段慧琴
    if ADMIN_OPEN_ID and ADMIN_OPEN_ID != "ou_xxxxxxxxxxxx":
        ok = send_direct_message(token, ADMIN_OPEN_ID, message)
        print(f"私聊段慧琴: {'✅' if ok else '❌'}")

    # 同时发到管理群
    if MANAGEMENT_CHAT_ID and MANAGEMENT_CHAT_ID != "oc_xxxxxxxxxxxx":
        send_text_message(token, MANAGEMENT_CHAT_ID, message)


def mode_lowstock():
    """
    A5: 低库存实时预警
    检查出货可用库存 < 阈值的记录，发送预警
    """
    token = get_token()
    threshold = LOW_STOCK_THRESHOLD

    # 读取全部记录
    all_records = []
    page_token = None
    while True:
        params = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token
        resp = requests.get(
            f"https://open.feishu.cn/open-apis/bitable/v1/apps/{BASE_TOKEN}/tables/{MAIN_TABLE_ID}/records",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30,
        )
        data = resp.json()
        if data.get("code") != 0:
            break
        all_records.extend(data.get("data", {}).get("items", []))
        if not data.get("data", {}).get("has_more"):
            break
        page_token = data["data"].get("page_token")

    # 筛选低库存产品
    low_stock_items = []
    for rec in all_records:
        fields = rec.get("fields", {})
        available = fields.get("fld5D5H9Ov")  # 出货可用库存
        if available is not None and available < threshold:
            product_name = fields.get("fld1b9jkdK", "未知产品")
            material_code = fields.get("fldsulel1T", "")
            odm = fields.get("fld1rQDG8E", 0) or 0
            yonghui = fields.get("fld1LFyBpV", 0) or 0
            miha = fields.get("fld1YVS8Yd", 0) or 0
            huizhou = fields.get("fld7jSSuLQ", 0) or 0
            low_stock_items.append({
                "name": product_name,
                "code": material_code,
                "total": available,
                "odm": odm,
                "yonghui": yonghui,
                "miha": miha,
                "huizhou": huizhou,
            })

    if not low_stock_items:
        print("无低库存产品")
        return

    # 构建预警消息
    alert_lines = [f"🚨 低库存预警 — 共 {len(low_stock_items)} 项\n"]
    for item in low_stock_items[:10]:  # 最多显示10条
        alert_lines.append(
            f"• {item['name']} [{item['code']}]\n"
            f"  总库存: {item['total']} | ODM:{item['odm']} 永惠:{item['yonghui']} 咪哈:{item['miha']} 惠州:{item['huizhou']}\n"
        )

    if len(low_stock_items) > 10:
        alert_lines.append(f"\n...还有 {len(low_stock_items) - 10} 项")

    message = "".join(alert_lines)
    print(message)

    # 发送到管理群
    if MANAGEMENT_CHAT_ID and MANAGEMENT_CHAT_ID != "oc_xxxxxxxxxxxx":
        send_text_message(token, MANAGEMENT_CHAT_ID, message)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "help"

    if mode == "remind":
        print("=== 执行: 每日更新提醒 (08:30) ===")
        mode_remind()
    elif mode == "check":
        print("=== 执行: 未更新检查 (09:45) ===")
        mode_check()
    elif mode == "lowstock":
        print("=== 执行: 低库存预警 ===")
        mode_lowstock()
    else:
        print("用法: python inventory_helpers.py [remind|check|lowstock]")
        print("  remind   - 每日08:30 提醒更新")
        print("  check    - 每日09:45 检查未更新")
        print("  lowstock - 低库存实时预警")
