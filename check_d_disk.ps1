# D Drive Analysis
$drive = Get-PSDrive D -ErrorAction SilentlyContinue
if (-not $drive) {
    Write-Host "D drive not found!"
    exit
}

Write-Host "========== D Drive Summary =========="
$usedGB = [math]::Round($drive.Used/1GB, 2)
$freeGB = [math]::Round($drive.Free/1GB, 2)
$totalGB = [math]::Round(($drive.Used + $drive.Free)/1GB, 2)
Write-Host "Total: $totalGB GB | Used: $usedGB GB | Free: $freeGB GB"

Write-Host "`n========== D:\ Top-Level Folders =========="
$folders = Get-ChildItem -Path D:\ -Directory -ErrorAction SilentlyContinue
$results = @()
foreach ($f in $folders) {
    try {
        $size = (Get-ChildItem -Path $f.FullName -Recurse -ErrorAction SilentlyContinue -Force |
                 Where-Object { -not $_.PSIsContainer } |
                 Measure-Object -Property Length -Sum).Sum
        [PSCustomObject]@{
            Name = $f.Name
            SizeGB = if ($size) { [math]::Round($size/1GB, 2) } else { 0 }
        }
    } catch {}
}
$results | Sort-Object SizeGB -Descending | Format-Table -AutoSize

Write-Host "`n========== D:\ Root Large Files (>100MB) =========="
Get-ChildItem -Path D:\ -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 100MB } |
    Sort-Object Length -Descending |
    ForEach-Object {
        [PSCustomObject]@{
            Name = $_.Name
            SizeGB = [math]::Round($_.Length/1GB, 2)
        }
    } | Format-Table -AutoSize

Write-Host "`n========== Top 30 Largest Files on D:\ (scanning...) =========="
Get-ChildItem -Path D:\ -Recurse -ErrorAction SilentlyContinue -Force |
    Where-Object { -not $_.PSIsContainer -and $_.Length -gt 200MB } |
    Sort-Object Length -Descending |
    Select-Object -First 30 |
    ForEach-Object {
        [PSCustomObject]@{
            SizeGB = [math]::Round($_.Length/1GB, 2)
            Path = $_.FullName
        }
    } | Format-Table -AutoSize -Wrap
