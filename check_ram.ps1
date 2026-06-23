$ram = Get-CimInstance Win32_ComputerSystem
$ramGB = [math]::Round($ram.TotalPhysicalMemory/1GB, 0)
Write-Host "Physical RAM: $ramGB GB"

$pageFiles = Get-CimInstance Win32_PageFileUsage
foreach ($pf in $pageFiles) {
    $sizeMB = [math]::Round($pf.AllocatedBaseSize, 0)
    $usedMB = [math]::Round($pf.CurrentUsage, 0)
    Write-Host "Pagefile: $($pf.Name) | Allocated: $sizeMB MB | Currently Used: $usedMB MB"
}

$os = Get-CimInstance Win32_OperatingSystem
Write-Host "`nTotal Virtual Memory: $([math]::Round($os.TotalVirtualMemorySize/1GB, 1)) GB"
Write-Host "Free Virtual Memory: $([math]::Round($os.FreeVirtualMemory/1GB, 1)) GB"
