#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = "XFHFwuoKEi2m8gkVbK8c88L0nMc";
const OUT = __dirname;

const formula = JSON.stringify([[{
    formula: `=IFERROR(XLOOKUP(B2,'发货订单'!A:A,'发货订单'!J:J),"")`,
    cell_styles: { background_color: '#ffffff', font_size: 12, horizontal_alignment: 'left', vertical_alignment: 'middle' },
    border_styles: { bottom: { color: '#1f2329', style: 'solid', weight: 'thin' }, top: { color: '#1f2329', style: 'solid', weight: 'thin' }, left: { color: '#1f2329', style: 'solid', weight: 'thin' }, right: { color: '#1f2329', style: 'solid', weight: 'thin' } }
}]]);

const tmp = path.join(OUT, '.tmp_restore_p.json');
fs.writeFileSync(tmp, formula, 'utf8');

console.log("恢复P列XLOOKUP动态公式...");
execSync(`lark-cli sheets +cells-set --spreadsheet-token "${TOKEN}" --sheet-name "账单" --range "P2" --cells - --copy-to-range "P2:P29464" --as user --format json < .tmp_restore_p.json`, { timeout: 120000, encoding: 'utf8', cwd: OUT });
fs.unlinkSync(tmp);
console.log("完成: P列已恢复为动态公式");
