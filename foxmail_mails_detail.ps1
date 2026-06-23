$mailsPath = "D:\Foxmail 7.2\Storage\lujiajia@70mai.com\Mails"

Write-Host "========== Sample: Top 3 largest Mails folders =========="
$folders = Get-ChildItem -Path $mailsPath -Directory | Sort-Object {
    (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue |
     Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
} -Descending | Select-Object -First 3

foreach ($f in $folders) {
    $totalSize = (Get-ChildItem $f.FullName -Recurse -Force -ErrorAction SilentlyContinue |
                  Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
    Write-Host "`nFolder: $($f.Name) ($([math]::Round($totalSize/1GB,2)) GB)"

    # Check structure depth
    $files = Get-ChildItem $f.FullName -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer }
    $fileCount = $files.Count
    Write-Host "  Total files: $fileCount"

    # Show file extensions breakdown
    Write-Host "  By extension:"
    $files | Group-Object Extension | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object {
        $extSize = ($_.Group | Measure-Object Length -Sum).Sum
        Write-Host "    $($_.Name) - $($_.Count) files, $([math]::Round($extSize/1GB,2)) GB"
    }

    # Show sample subfolder structure
    Write-Host "  Subfolders:"
    Get-ChildItem $f.FullName -Directory | ForEach-Object {
        $subSize = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue |
                    Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
        Write-Host "    $($_.Name) - $([math]::Round($subSize/1GB,2)) GB"
    } | Select-Object -First 15
}

# Also check if there's a Global log
Write-Host "`n========== Global Log Files =========="
Get-ChildItem "D:\Foxmail 7.2\Global\Log" -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 5 | ForEach-Object {
    Write-Host "$($_.Name) - $([math]::Round($_.Length/1MB,1)) MB"
}

Write-Host "`n========== Old Foxmail Versions =========="
Get-ChildItem "D:\Foxmail 7.2" -Directory | Where-Object { $_.Name -match '^[\d.]+$' } | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue |
             Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
    Write-Host "$($_.Name) - $([math]::Round($size/1MB,1)) MB"
}
