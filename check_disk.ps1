# 1. C盘总体使用情况
Write-Host "========== C盘总体使用情况 =========="
Get-PSDrive C | Select-Object Used, Free, @{Name='Total(GB)';Expression={[math]::Round(($_.Used + $_.Free)/1GB, 2)}}, @{Name='Used(GB)';Expression={[math]::Round($_.Used/1GB, 2)}}, @{Name='Free(GB)';Expression={[math]::Round($_.Free/1GB, 2)}}

# 2. C盘根目录下各文件夹大小（扫两层）
Write-Host "`n========== C:\ 根目录各文件夹大小 =========="
Get-ChildItem -Path C:\ -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $size = (Get-ChildItem -Path $_.FullName -Recurse -ErrorAction SilentlyContinue -Force |
                 Where-Object { !$_.PSIsContainer } |
                 Measure-Object -Property Length -Sum).Sum
        [PSCustomObject]@{
            Name = $_.Name
            'Size(GB)' = if ($size) { [math]::Round($size/1GB, 2) } else { 0 }
        }
    } catch {}
} | Sort-Object 'Size(GB)' -Descending | Format-Table -AutoSize

# 3. C:\Users 下各用户文件夹大小
Write-Host "`n========== C:\Users 各用户文件夹 =========="
Get-ChildItem -Path C:\Users -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $size = (Get-ChildItem -Path $_.FullName -Recurse -ErrorAction SilentlyContinue -Force |
             Where-Object { !$_.PSIsContainer } |
             Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{
        Name = $_.Name
        'Size(GB)' = if ($size) { [math]::Round($size/1GB, 2) } else { 0 }
    }
} | Sort-Object 'Size(GB)' -Descending | Format-Table -AutoSize

# 4. C:\Users\<当前用户> 下各子文件夹
$userPath = "$env:USERPROFILE"
Write-Host "`n========== $userPath 各子文件夹 =========="
Get-ChildItem -Path $userPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $size = (Get-ChildItem -Path $_.FullName -Recurse -ErrorAction SilentlyContinue -Force |
             Where-Object { !$_.PSIsContainer } |
             Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{
        Name = $_.Name
        'Size(GB)' = if ($size) { [math]::Round($size/1GB, 2) } else { 0 }
    }
} | Sort-Object 'Size(GB)' -Descending | Format-Table -AutoSize

# 5. 全盘最大的20个文件（可能很慢，放最后）
Write-Host "`n========== C盘最大的20个文件 =========="
Write-Host "正在扫描，请耐心等待..."
Get-ChildItem -Path C:\ -Recurse -ErrorAction SilentlyContinue -Force |
    Where-Object { !$_.PSIsContainer -and $_.Length -gt 100MB } |
    Sort-Object Length -Descending |
    Select-Object -First 20 |
    ForEach-Object {
        [PSCustomObject]@{
            Path = $_.FullName
            'Size(GB)' = [math]::Round($_.Length/1GB, 2)
        }
    } | Format-Table -AutoSize -Wrap
