#!/usr/bin/env python3
"""
快递费用核对分析脚本
1. 分批读取账单和发货订单数据
2. 按快递计算规则核验
3. 生成差异分析结果
"""
import subprocess
import json
import csv
import os
import sys
import math
from collections import defaultdict

SPREADSHEET_TOKEN = "XFHFwuoKEi2m8gkVbK8c88L0nMc"
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ====== 快递计算规则 ======
RULES = {
    "韵达快递": {
        "first_weight_kg": 1,
        "first_price": 2.8,
        "in_province_续重_per_kg": 1.0,    # 广东省内
        "out_province_续重_per_kg": 1.5,   # 广东省外
        "remote_续重_per_kg": 1.5,         # 偏远地区
        "operation_fee": 0.9,
    },
    "顺丰快递": {
        "first_weight_kg": 1,
        "first_price": 7.0,
        "in_province_续重_per_kg": 1.5,
        "out_province_续重_per_kg": 3.5,
        "remote_续重_per_kg": 14.0,
        "operation_fee": 1.0,
    },
    "顺丰惠州": {  # 顺丰惠州也视为顺丰
        "first_weight_kg": 1,
        "first_price": 7.0,
        "in_province_续重_per_kg": 1.5,
        "out_province_续重_per_kg": 3.5,
        "remote_续重_per_kg": 14.0,
        "operation_fee": 1.0,
    },
}

REMOTE_PROVINCES = {"甘肃省", "新疆维吾尔自治区", "青海省", "内蒙古自治区", "西藏自治区"}

def call_lark_api(sheet_name, range_str):
    """调用 lark-cli 读取表格数据"""
    cmd = [
        "lark-cli", "sheets", "+csv-get",
        "--spreadsheet-token", SPREADSHEET_TOKEN,
        "--sheet-name", sheet_name,
        "--range", range_str,
        "--as", "user",
        "--format", "json"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        print(f"API error: {result.stderr}")
        return None
    data = json.loads(result.stdout)
    if not data.get("ok"):
        print(f"API failed: {data.get('error', {}).get('message', 'unknown')}")
        return None
    return data["data"]["annotated_csv"]

def parse_csv_to_rows(annotated_csv):
    """解析 annotated_csv 为行列表"""
    rows = []
    reader = csv.reader(annotated_csv.splitlines())
    for line in reader:
        if not line:
            continue
        # 第一个字段是 [row=N]，提取行号和实际字段
        first = line[0]
        if first.startswith("[row="):
            # 提取行号
            row_num = int(first.split("]")[0].replace("[row=", ""))
            # 实际字段：第一个字段去掉 [row=N] 前缀，加上其余字段
            actual_first = first.split("]", 1)[1] if "]" in first else ""
            fields = [actual_first] + line[1:]
            rows.append((row_num, fields))
    return rows

def calculate_theoretical_fee(courier, province, weight_kg):
    """根据规则计算理论快递费（不含操作费）"""
    rule = RULES.get(courier)
    if not rule:
        return None, None  # 未知快递公司

    first_price = rule["first_price"]
    first_weight = rule["first_weight_kg"]
    operation_fee = rule["operation_fee"]

    if weight_kg is None or weight_kg <= 0:
        weight_kg = 1  # 默认1KG

    # 续重计算
    if weight_kg <= first_weight:
        fee = first_price
    else:
        excess = weight_kg - first_weight
        # 不足1KG按1KG计费，向上取整
        excess_kg = math.ceil(excess)

        # 判断地区类型
        if province in ("广东省",):
           续重单价 = rule["in_province_续重_per_kg"]
        elif province in REMOTE_PROVINCES:
            续重单价 = rule["remote_续重_per_kg"]
        else:
            续重单价 = rule["out_province_续重_per_kg"]

        fee = first_price + excess_kg * 续重单价

    total = fee + operation_fee
    return round(fee, 2), round(total, 2)

def fetch_all_data(sheet_name, total_rows, columns):
    """分批读取全部数据"""
    all_rows = []
    batch_size = 3000
    col_letter = columns[-1]  # like "O" or "N"

    for start in range(1, total_rows + 1, batch_size):
        end = min(start + batch_size - 1, total_rows)
        range_str = f"A{start}:{col_letter}{end}"
        print(f"  读取 {sheet_name} rows {start}-{end}...")
        csv_data = call_lark_api(sheet_name, range_str)
        if csv_data is None:
            print(f"  重试 {sheet_name} rows {start}-{end}...")
            csv_data = call_lark_api(sheet_name, range_str)
        if csv_data is None:
            print(f"  跳过 {sheet_name} rows {start}-{end}")
            continue
        rows = parse_csv_to_rows(csv_data)
        all_rows.extend(rows)
        print(f"  已获取 {len(rows)} 行，累计 {len(all_rows)} 行")
    return all_rows

def main():
    print("=== 快递费用核对分析 ===\n")

    # Step 1: Fetch billing data (29,464 rows)
    print("Step 1: 读取账单数据...")
    bill_rows = fetch_all_data("账单", 29464, list("ABCDEFGHIJKLMNO"))
    print(f"账单数据: {len(bill_rows)} 行\n")

    # Step 2: Fetch shipping orders data (58,008 rows)
    print("Step 2: 读取发货订单数据...")
    order_rows = fetch_all_data("发货订单", 58008, list("ABCDEFGHIJKLMN"))
    print(f"发货订单数据: {len(order_rows)} 行\n")

    # Step 3: Build index
    print("Step 3: 建立索引...")
    # 发货订单以物流单号为key
    orders_by_tracking = {}
    for row_num, fields in order_rows:
        if row_num == 1:  # skip header
            continue
        tracking_no = fields[0].strip() if len(fields) > 0 else ""
        if tracking_no:
            orders_by_tracking[tracking_no] = {
                "row": row_num,
                "courier": fields[1].strip() if len(fields) > 1 else "",
                "store": fields[2].strip() if len(fields) > 2 else "",
                "product_line": fields[3].strip() if len(fields) > 3 else "",
                "province": fields[4].strip() if len(fields) > 4 else "",
                "ship_time": fields[5].strip() if len(fields) > 5 else "",
                "product_name": fields[6].strip() if len(fields) > 6 else "",
                "sku": fields[7].strip() if len(fields) > 7 else "",
                "quantity": fields[8].strip() if len(fields) > 8 else "",
                "unit_weight": fields[11].strip() if len(fields) > 11 else "",
                "total_weight": fields[12].strip() if len(fields) > 12 else "",
                "shop": fields[13].strip() if len(fields) > 13 else "",
            }
    print(f"发货订单唯一单号: {len(orders_by_tracking)}")

    # Step 4: Reconcile
    print("\nStep 4: 核对分析...")
    results = []
    stats = {
        "total_bill": 0,
        "matched": 0,
        "not_in_order": 0,
        "fee_match": 0,
        "fee_diff": 0,
        "weight_diff": 0,
    }

    for row_num, fields in bill_rows:
        if row_num == 1:  # header
            continue
        if len(fields) < 8:
            continue

        bill_no = fields[1].strip() if len(fields) > 1 else ""
        courier = fields[2].strip() if len(fields) > 2 else ""
        province = fields[3].strip() if len(fields) > 3 else ""
        weight = fields[4].strip() if len(fields) > 4 else ""
        bill_fee = fields[5].strip() if len(fields) > 5 else ""
        bill_op_fee = fields[6].strip() if len(fields) > 6 else ""
        bill_amount = fields[7].strip() if len(fields) > 7 else ""
        merchant = fields[8].strip() if len(fields) > 8 else ""

        if not bill_no:
            continue

        stats["total_bill"] += 1

        result = {
            "bill_row": row_num,
            "bill_no": bill_no,
            "courier": courier,
            "province": province,
            "bill_weight": weight,
            "bill_fee": bill_fee,
            "bill_op_fee": bill_op_fee,
            "bill_amount": bill_amount,
            "merchant": merchant,
            "in_order": False,
            "order_courier": "",
            "order_province": "",
            "order_weight": "",
            "theoretical_weight": "",
            "theoretical_fee": "",
            "theoretical_total": "",
            "fee_diff": "",
            "weight_match": "",
            "status": "",
        }

        # Check if in shipping orders
        order = orders_by_tracking.get(bill_no)
        if order:
            stats["matched"] += 1
            result["in_order"] = True
            result["order_courier"] = order["courier"]
            result["order_province"] = order["province"]
            result["order_weight"] = order["total_weight"]

            # Map courier name
            courier_for_calc = courier
            if "顺丰" in courier:
                courier_for_calc = "顺丰快递"

            # Calculate theoretical fee
            try:
                w = float(order["total_weight"]) if order["total_weight"] else 0
            except:
                w = 0

            if courier_for_calc in RULES:
                theo_fee, theo_total = calculate_theoretical_fee(courier_for_calc, province, w)
                result["theoretical_weight"] = str(w)
                result["theoretical_fee"] = str(theo_fee) if theo_fee else ""
                result["theoretical_total"] = str(theo_total) if theo_total else ""

                # Compare
                try:
                    actual_total = float(bill_amount) if bill_amount else 0
                    if theo_total is not None:
                        diff = round(actual_total - theo_total, 2)
                        result["fee_diff"] = str(diff)
                        if abs(diff) < 0.01:
                            stats["fee_match"] += 1
                            result["status"] = "金额一致"
                        else:
                            stats["fee_diff"] += 1
                            result["status"] = f"金额差异{diff}元"
                except:
                    pass

                # Weight comparison
                try:
                    bill_w = float(weight) if weight else 0
                    if abs(bill_w - w) < 0.001:
                        result["weight_match"] = "一致"
                    else:
                        result["weight_match"] = f"差异({bill_w} vs {w})"
                        stats["weight_diff"] += 1
                except:
                    pass
            else:
                result["status"] = f"未知快递公司:{courier}"
        else:
            stats["not_in_order"] += 1
            result["status"] = "未在发货订单中找到"

        results.append(result)

    # Step 5: Summary
    print(f"\n{'='*60}")
    print(f"=== 核对结果汇总 ===")
    print(f"账单总记录数: {stats['total_bill']}")
    print(f"匹配到发货订单: {stats['matched']}")
    print(f"未在发货订单中: {stats['not_in_order']}")
    print(f"金额一致: {stats['fee_match']}")
    print(f"金额有差异: {stats['fee_diff']}")
    print(f"重量有差异: {stats['weight_diff']}")

    # Step 6: Save detailed CSV
    csv_path = os.path.join(OUTPUT_DIR, "express_fee_analysis_detail.csv")
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow([
            "账单行号", "单号", "快递公司", "目的地省", "账单重量", "账单快递费",
            "账单操作费", "账单金额", "商家ID", "是否在发货订单",
            "订单快递公司", "订单省份", "订单总重量", "理论重量",
            "理论快递费", "理论总费用", "费用差异", "重量匹配", "状态"
        ])
        for r in results:
            writer.writerow([
                r["bill_row"], r["bill_no"], r["courier"], r["province"],
                r["bill_weight"], r["bill_fee"], r["bill_op_fee"], r["bill_amount"],
                r["merchant"], "是" if r["in_order"] else "否",
                r["order_courier"], r["order_province"], r["order_weight"],
                r["theoretical_weight"], r["theoretical_fee"], r["theoretical_total"],
                r["fee_diff"], r["weight_match"], r["status"]
            ])
    print(f"\n详细结果已保存到: {csv_path}")

    # Step 7: Summary by category
    print(f"\n=== 差异分析 ===")
    # By courier
    courier_stats = defaultdict(lambda: {"total": 0, "diff": 0, "match": 0, "not_found": 0})
    for r in results:
        c = r["courier"]
        courier_stats[c]["total"] += 1
        if not r["in_order"]:
            courier_stats[c]["not_found"] += 1
        elif r["status"] == "金额一致":
            courier_stats[c]["match"] += 1
        elif "差异" in str(r["status"]):
            courier_stats[c]["diff"] += 1

    for courier, st in sorted(courier_stats.items()):
        print(f"\n{courier}:")
        print(f"  总计: {st['total']}, 匹配: {st['match']}, 差异: {st['diff']}, 未找到: {st['not_found']}")

    # Top 10 discrepancies
    print(f"\n=== 金额差异TOP20 ===")
    diffs = [r for r in results if r["fee_diff"] and float(r["fee_diff"]) != 0]
    diffs.sort(key=lambda x: abs(float(x["fee_diff"])), reverse=True)
    for r in diffs[:20]:
        print(f"  单号:{r['bill_no']} 快递:{r['courier']} 省份:{r['province']} "
              f"重量:{r['bill_weight']} 账单金额:{r['bill_amount']} "
              f"理论:{r['theoretical_total']} 差异:{r['fee_diff']}")

    # Special: find bills not in orders
    print(f"\n=== 未在发货订单中的账单 (前20条) ===")
    not_found = [r for r in results if not r["in_order"]]
    for r in not_found[:20]:
        print(f"  单号:{r['bill_no']} 快递:{r['courier']} 省份:{r['province']} 金额:{r['bill_amount']}")

    print(f"\n=== 分析完成 ===")
    return results, stats

if __name__ == "__main__":
    main()
