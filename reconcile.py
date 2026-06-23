#!/usr/bin/env python3
"""
仓库渠道数据 vs NC系统销售出库 自动对账脚本
匹配逻辑: 物料编码 + 物流单号/快递单号
"""
import json
import csv
import io
import re
from collections import defaultdict

def parse_annotated_csv(annotated_csv):
    """Parse the annotated CSV format from Feishu sheets"""
    rows = []
    # Remove [row=N] prefix from each logical line
    # Handle CSV properly with quoted fields
    lines = annotated_csv.strip().split('\n')
    current_row = None
    current_data = ""

    for line in lines:
        match = re.match(r'^\[row=(\d+)\] (.*)', line)
        if match:
            # Save previous row if exists
            if current_row is not None:
                rows.append((current_row, current_data))
            current_row = int(match.group(1))
            current_data = match.group(2)
        else:
            # Continuation of previous row (multi-line field)
            current_data += '\n' + line

    if current_row is not None:
        rows.append((current_row, current_data))

    # Parse CSV rows
    parsed = []
    for row_num, data in rows:
        reader = csv.reader(io.StringIO(data))
        try:
            fields = next(reader)
            parsed.append((row_num, fields))
        except StopIteration:
            pass

    return parsed

def load_data(filepath):
    """Load data from Feishu API JSON output file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    data = json.loads(content)
    annotated_csv = data['data']['annotated_csv']
    col_indices = data['data']['col_indices']

    rows = parse_annotated_csv(annotated_csv)
    return rows, col_indices

def main():
    # File paths
    warehouse_file = r"C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-Claude-code\5ac0f536-086a-4e50-9474-cea2f8515324\tool-results\bx9gr2d6o.txt"
    nc_file = r"C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-Claude-code\5ac0f536-086a-4e50-9474-cea2f8515324\tool-results\bp32qfusy.txt"

    print("Loading warehouse data...")
    warehouse_rows, wh_cols = load_data(warehouse_file)
    print(f"  Loaded {len(warehouse_rows)} rows (including header)")

    print("Loading NC data...")
    nc_rows, nc_cols = load_data(nc_file)
    print(f"  Loaded {len(nc_rows)} rows (including header)")

    # Parse warehouse data
    # Columns: A=渠道, B=出货日期, C=物流公司, D=物流单号, E=收件公司, F=出货主体
    #           G=项目名称, H=物料编码, I=物料名称, J=数量, K=采购订单号
    #           L=备注, M=渠道, N=产品线, O=备注
    wh_header = warehouse_rows[0][1]
    wh_data = warehouse_rows[1:]  # Skip header

    # Parse NC data
    # Columns: N=物料编码(13), O=物料名称(14), L=客户名称(11)
    #           Z=物流公司(25), AA=快递单号(26), F=单据号(5)
    #           AF=出库(31), AG=出库(32), B=业务日期(1)
    nc_header = nc_rows[0][1]
    nc_data = nc_rows[1:]  # Skip header

    # Build NC index: key = (物料编码, 快递单号) -> list of records
    nc_index = defaultdict(list)
    for row_num, fields in nc_data:
        if len(fields) > 26:
            material_code = fields[13].strip() if len(fields) > 13 else ""  # N column
            tracking_no = fields[26].strip() if len(fields) > 26 else ""    # AA column
            qty_out1 = fields[31].strip() if len(fields) > 31 else ""       # AF column
            qty_out2 = fields[32].strip() if len(fields) > 32 else ""       # AG column

            key = (material_code, tracking_no)
            nc_index[key].append({
                'row': row_num,
                'material_code': material_code,
                'material_name': fields[14].strip() if len(fields) > 14 else "",
                'customer': fields[11].strip() if len(fields) > 11 else "",
                'doc_no': fields[5].strip() if len(fields) > 5 else "",
                'tracking_no': tracking_no,
                'logistics': fields[25].strip() if len(fields) > 25 else "",
                'qty_out1': qty_out1,
                'qty_out2': qty_out2,
                'date': fields[1].strip() if len(fields) > 1 else "",
            })

    # Also build NC index by material code only
    nc_by_material = defaultdict(list)
    for row_num, fields in nc_data:
        if len(fields) > 14:
            material_code = fields[13].strip()
            tracking_no = fields[26].strip() if len(fields) > 26 else ""
            qty_out1 = fields[31].strip() if len(fields) > 31 else ""
            qty_out2 = fields[32].strip() if len(fields) > 32 else ""

            nc_by_material[material_code].append({
                'row': row_num,
                'material_code': material_code,
                'material_name': fields[14].strip() if len(fields) > 14 else "",
                'customer': fields[11].strip() if len(fields) > 11 else "",
                'doc_no': fields[5].strip() if len(fields) > 5 else "",
                'tracking_no': tracking_no,
                'logistics': fields[25].strip() if len(fields) > 25 else "",
                'qty_out1': qty_out1,
                'qty_out2': qty_out2,
                'date': fields[1].strip() if len(fields) > 1 else "",
            })

    print(f"\nNC index built: {len(nc_index)} unique (material+tracking) keys")
    print(f"NC material-only index: {len(nc_by_material)} unique materials")

    # Reconciliation results
    results = []
    matched_count = 0
    unmatched_count = 0
    partial_match_count = 0

    for row_num, fields in wh_data:
        if len(fields) < 10:
            continue

        channel = fields[0].strip() if len(fields) > 0 else ""
        date = fields[1].strip() if len(fields) > 1 else ""
        logistics = fields[2].strip() if len(fields) > 2 else ""
        tracking_no = fields[3].strip() if len(fields) > 3 else ""
        customer = fields[4].strip() if len(fields) > 4 else ""
        entity = fields[5].strip() if len(fields) > 5 else ""
        project = fields[6].strip() if len(fields) > 6 else ""
        material_code = fields[7].strip() if len(fields) > 7 else ""
        material_name = fields[8].strip() if len(fields) > 8 else ""
        wh_qty = fields[9].strip() if len(fields) > 9 else ""
        po_no = fields[10].strip() if len(fields) > 10 else ""
        remark = fields[11].strip() if len(fields) > 11 else ""

        # Try to parse warehouse quantity
        try:
            wh_qty_num = float(wh_qty.replace(',', '')) if wh_qty else 0
        except ValueError:
            wh_qty_num = 0

        # Match by material_code + tracking_no
        key = (material_code, tracking_no)

        result = {
            'wh_row': row_num,
            'channel': channel,
            'date': date,
            'logistics': logistics,
            'tracking_no': tracking_no,
            'customer': customer,
            'material_code': material_code,
            'material_name': material_name,
            'wh_qty': wh_qty_num,
            'po_no': po_no,
            'remark': remark,
            'nc_matches': [],
            'nc_total_qty': 0,
            'match_status': '',
            'qty_diff': 0,
        }

        if key in nc_index:
            nc_records = nc_index[key]
            nc_total = 0
            for nc in nc_records:
                try:
                    nc_qty = float(nc['qty_out1'].replace(',', '')) if nc['qty_out1'] else 0
                except ValueError:
                    nc_qty = 0
                nc_total += nc_qty
                result['nc_matches'].append(nc)

            result['nc_total_qty'] = nc_total
            result['qty_diff'] = wh_qty_num - nc_total

            if abs(result['qty_diff']) < 0.01:
                result['match_status'] = '✅ 匹配一致'
                matched_count += 1
            else:
                result['match_status'] = '⚠️ 数量差异'
                partial_match_count += 1
        else:
            # Try matching by material code only (fallback)
            if material_code in nc_by_material:
                nc_records = nc_by_material[material_code]
                nc_total = 0
                for nc in nc_records:
                    try:
                        nc_qty = float(nc['qty_out1'].replace(',', '')) if nc['qty_out1'] else 0
                    except ValueError:
                        nc_qty = 0
                    nc_total += nc_qty
                    result['nc_matches'].append(nc)

                result['nc_total_qty'] = nc_total
                result['qty_diff'] = wh_qty_num - nc_total
                result['match_status'] = '🔶 仅物料匹配(单号不同)'
                partial_match_count += 1
            else:
                result['match_status'] = '❌ NC无匹配'
                unmatched_count += 1

        results.append(result)

    # Also find NC records not matched to any warehouse record
    matched_nc_rows = set()
    for r in results:
        for nc in r['nc_matches']:
            matched_nc_rows.add(nc['row'])

    nc_unmatched = []
    for row_num, fields in nc_data:
        if row_num not in matched_nc_rows and len(fields) > 14:
            nc_unmatched.append({
                'row': row_num,
                'material_code': fields[13].strip() if len(fields) > 13 else "",
                'material_name': fields[14].strip() if len(fields) > 14 else "",
                'customer': fields[11].strip() if len(fields) > 11 else "",
                'doc_no': fields[5].strip() if len(fields) > 5 else "",
                'tracking_no': fields[26].strip() if len(fields) > 26 else "",
                'qty_out1': fields[31].strip() if len(fields) > 31 else "",
            })

    # Print summary
    print(f"\n========== 对账结果汇总 ==========")
    print(f"仓库发货记录总数: {len(results)}")
    print(f"  ✅ 匹配一致: {matched_count}")
    print(f"  ⚠️ 数量差异: {partial_match_count}")
    print(f"  ❌ NC无匹配: {unmatched_count}")
    print(f"NC未匹配记录数: {len(nc_unmatched)}")

    # Print quantity differences
    print(f"\n========== 数量差异明细 ==========")
    diff_results = [r for r in results if r['match_status'] == '⚠️ 数量差异']
    for r in diff_results[:20]:
        print(f"  [{r['material_code']}] {r['material_name'][:40]}")
        print(f"    仓库: {r['wh_qty']} | NC: {r['nc_total_qty']} | 差异: {r['qty_diff']}")
        print(f"    物流单号: {r['tracking_no']} | 客户: {r['customer']}")

    if len(diff_results) > 20:
        print(f"  ... 还有 {len(diff_results) - 20} 条差异")

    # Print unmatched
    print(f"\n========== 仓库有但NC无匹配 (前20条) ==========")
    unmatched_results = [r for r in results if r['match_status'] == '❌ NC无匹配']
    for r in unmatched_results[:20]:
        print(f"  [{r['material_code']}] {r['material_name'][:50]} | Qty:{r['wh_qty']} | 单号:{r['tracking_no']}")

    if len(unmatched_results) > 20:
        print(f"  ... 还有 {len(unmatched_results) - 20} 条未匹配")

    print(f"\n========== NC有但仓库无匹配 (前20条) ==========")
    for r in nc_unmatched[:20]:
        print(f"  [{r['material_code']}] {r['material_name'][:50]} | Qty:{r['qty_out1']} | 单号:{r['tracking_no']}")

    if len(nc_unmatched) > 20:
        print(f"  ... 还有 {len(nc_unmatched) - 20} 条未匹配")

    # Save results to JSON for later use
    output = {
        'summary': {
            'warehouse_total': len(results),
            'matched': matched_count,
            'quantity_diff': partial_match_count,
            'unmatched': unmatched_count,
            'nc_unmatched': len(nc_unmatched),
        },
        'diff_details': [
            {
                'material_code': r['material_code'],
                'material_name': r['material_name'],
                'tracking_no': r['tracking_no'],
                'customer': r['customer'],
                'wh_qty': r['wh_qty'],
                'nc_qty': r['nc_total_qty'],
                'diff': r['qty_diff'],
                'status': r['match_status'],
                'wh_row': r['wh_row'],
            }
            for r in diff_results
        ],
        'unmatched_warehouse': [
            {
                'material_code': r['material_code'],
                'material_name': r['material_name'],
                'tracking_no': r['tracking_no'],
                'customer': r['customer'],
                'wh_qty': r['wh_qty'],
                'wh_row': r['wh_row'],
            }
            for r in unmatched_results
        ],
        'unmatched_nc': [
            {
                'material_code': r['material_code'],
                'material_name': r['material_name'],
                'tracking_no': r['tracking_no'],
                'customer': r['customer'],
                'nc_qty': r['qty_out1'],
                'nc_row': r['row'],
            }
            for r in nc_unmatched
        ],
    }

    output_path = r"C:\Users\Administrator\Desktop\Claude code\reconcile_result.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n详细结果已保存至: {output_path}")

    return results, nc_unmatched, output

if __name__ == '__main__':
    results, nc_unmatched, output = main()
