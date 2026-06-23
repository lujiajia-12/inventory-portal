# ============================================================
# 库存系统 Windows 定时任务安装脚本
# 仅工作日（周一至周五）执行
# 使用方法：右键 → 使用 PowerShell 运行（管理员权限）
# ============================================================

$scriptDir = "C:\Users\Administrator\Desktop\Claude code"
$pythonExe = "python"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  70迈库存系统 - Windows 定时任务安装" -ForegroundColor Cyan
Write-Host "  执行时间: 周一至周五" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---- 辅助函数 ----
function Create-WeekdayTask {
    param(
        [string]$TaskName,
        [string]$ScriptPath,
        [string]$Arguments,
        [string]$Time,
        [string]$Description
    )

    # 先删除旧任务（如果存在）
    schtasks /delete /tn "$TaskName" /f 2>$null

    # 创建仅工作日执行的任务
    # /sc weekly /d MON,TUE,WED,THU,FRI = 每周一到周五
    $cmd = "schtasks /create /tn `"$TaskName`" /tr `"$pythonExe `"$ScriptPath`" $Arguments`" /sc weekly /d MON,TUE,WED,THU,FRI /st $Time /ru Administrator /f"

    Write-Host "[创建] $TaskName" -ForegroundColor Yellow
    Write-Host "  脚本: $ScriptPath" -ForegroundColor Gray
    Write-Host "  时间: 工作日 $Time" -ForegroundColor Gray
    Write-Host "  描述: $Description" -ForegroundColor Gray

    Invoke-Expression $cmd

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ 创建成功" -ForegroundColor Green
    } else {
        Write-Host "  ❌ 创建失败 (退出码: $LASTEXITCODE)" -ForegroundColor Red
    }
    Write-Host ""
}

# ============================================================
# 任务1: 每日更新提醒 (周一至周五 08:30)
# ============================================================
Create-WeekdayTask `
    -TaskName "库存-更新提醒" `
    -ScriptPath "$scriptDir\inventory_helpers.py" `
    -Arguments "remind" `
    -Time "08:30" `
    -Description "工作日08:30提醒各仓位负责人更新库存"

# ============================================================
# 任务2: 未更新检查 (周一至周五 09:45)
# ============================================================
Create-WeekdayTask `
    -TaskName "库存-未更新检查" `
    -ScriptPath "$scriptDir\inventory_helpers.py" `
    -Arguments "check" `
    -Time "09:45" `
    -Description "工作日09:45检查未更新仓位并通知段慧琴"

# ============================================================
# 任务3: 快照归档 + 推送销售群 (周一至周五 10:00)
# ============================================================
Create-WeekdayTask `
    -TaskName "库存-快照归档" `
    -ScriptPath "$scriptDir\inventory_snapshot.py" `
    -Arguments "" `
    -Time "10:00" `
    -Description "工作日10:00快照归档并推送库存日报到销售群"

# ============================================================
# 汇总
# ============================================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装完成！已创建 3 个定时任务:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📅 周一至周五 08:30  →  库存-更新提醒" -ForegroundColor White
Write-Host "  📅 周一至周五 09:45  →  库存-未更新检查" -ForegroundColor White
Write-Host "  📅 周一至周五 10:00  →  库存-快照归档 (推送销售群)" -ForegroundColor White
Write-Host ""
Write-Host "  查看所有任务: schtasks /query /tn `"库存-*`"" -ForegroundColor Gray
Write-Host "  手动测试: python `"$scriptDir\inventory_snapshot.py`"" -ForegroundColor Gray
Write-Host ""
