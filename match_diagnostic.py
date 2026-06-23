#!/usr/bin/env python3
"""
XA226惠州仓 ↔ 库存总表 匹配诊断脚本
检查两个表的数据对齐情况，输出匹配率报告
"""

import os
import sys
import requests

FEISHU_APP_ID = os.environ.get("FEISHU_APP_ID", "cli_xxxxxxxxxxxx")
FEISHU_APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "xxxxxxxxxxxxxxxx")
BASE_TOKEN = "SW0ibNH7UaJ2RAsSUOHcdiuOnfL"
MAIN_TABLE_ID = "tblxfUkBA54MdLYx"       # 库存总表
HUIZHOU_TABLE_ID = "tbl54lsyJH45J5iV"    # XA226惠州仓


def get_token():
    resp = requests.post(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        json={"app_id": FEISHU_APP_ID, "app_secret": FEISHU_APP_SECRET},
        timeout=15,
    )
    return resp.json()["tenant_access_token"]


def get_all_records(token, table_id):
    records = []
    page_token = None
    while True:
        params = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token
        resp = requests.get(
            f"https://open.feishu.cn/open-apis/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/records",
            headers={"Authorization": f"Bearer {token}"},
            params=params, timeout=30,
        )
        data = resp.json()
        if data.get("code") != 0:
            raise Exception(f"Read error: {data}")
        records.extend(data["data"]["items"])
        if not data["data"].get("has_more"):
            break
        page_token = data["data"].get("page_token")
    return records


def main():
    token = get_token()

    print("📖 读取 XA226惠州仓子表...")
    hz_records = get_all_records(token, HUIZHOU_TABLE_ID)
    hz_map = {}
    for r in hz_records:
        f = r["fields"]
        code = f.get("助记符", "").strip()
        if code:
            hz_map[code] = {
                "name": f.get("商品名称", ""),
                "stock": f.get("可用库存", 0),
                "category": f.get("分类", ""),
            }
    print(f"  ✅ {len(hz_records)} 条记录，有效助记符 {len(hz_map)} 个")

    print("📖 读取 库存总表...")
    main_records = get_all_records(token, MAIN_TABLE_ID)
    print(f"  ✅ {len(main_records)} 条记录")

    # 匹配
    matched = 0
    unmatched_main = []
    for r in main_records:
        f = r["fields"]
        code = f.get("料号", "").strip()
        if code in hz_map:
            matched += 1
        else:
            unmatched_main.append({
                "code": code,
                "name": f.get("产品名称", "")[:50],
            })

    unmatched_hz = []
    main_codes = {r["fields"].get("料号", "").strip() for r in main_records}
    for code, info in hz_map.items():
        if code not in main_codes:
            unmatched_hz.append({"code": code, "name": info["name"]})

    # 报告
    match_rate = matched / len(main_records) * 100 if main_records else 0
    print(f"\n{'='*50}")
    print(f"📊 匹配报告")
    print(f"{'='*50}")
    print(f"  库存总表产品数:     {len(main_records)}")
    print(f"  XA226惠州仓记录数:  {len(hz_records)}")
    print(f"  成功匹配:           {matched} ({match_rate:.1f}%)")
    print(f"  总表中未匹配:       {len(unmatched_main)}")
    print(f"  惠州仓中未匹配:     {len(unmatched_hz)}")

    if unmatched_main:
        print(f"\n⚠️ 库存总表中未匹配的记录（前20条）:")
        for item in unmatched_main[:20]:
            print(f"  料号={item['code']}  名称={item['name']}")

    if unmatched_hz:
        print(f"\n⚠️ XA226惠州仓中未匹配的记录（前20条）:")
        for item in unmatched_hz[:20]:
            print(f"  助记符={item['code']}  名称={item['name']}")

    print(f"\n💡 说明:")
    print(f"  匹配条件: 库存总表.料号 = XA226惠州仓.助记符")
    print(f"  匹配成功 → lookup字段自动拉取可用库存")
    print(f"  未匹配 → 需要人工确认助记符是否等于料号，或在惠州仓表中新增对应记录")


if __name__ == "__main__":
    main()
