$drive = Get-PSDrive C
$usedGB = [math]::Round($drive.Used/1GB, 2)
$freeGB = [math]::Round($drive.Free/1GB, 2)
$totalGB = [math]::Round(($drive.Used + $drive.Free)/1GB, 2)
Write-Host "Total: $totalGB GB | Used: $usedGB GB | Free: $freeGB GB"
