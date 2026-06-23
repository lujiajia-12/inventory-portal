$foxmail = "D:\Foxmail 7.2"
if (-not (Test-Path $foxmail)) {
    $foxmail = "D:\Program Files\Foxmail 7.2"
}
if (-not (Test-Path $foxmail)) {
    Write-Host "Foxmail folder not found!"
    exit
}

Write-Host "Foxmail path: $foxmail"

# Top level
Write-Host "`n========== Top Level =========="
Get-ChildItem -Path $foxmail -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $size = (Get-ChildItem -Path $_.FullName -Recurse -ErrorAction SilentlyContinue -Force |
             Where-Object { -not $_.PSIsContainer } |
             Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{ Name = $_.Name; SizeGB = if($size){[math]::Round($size/1GB,2)}else{0} }
} | Sort-Object SizeGB -Descending | Format-Table -AutoSize

# Storage accounts
$storage = "$foxmail\Storage"
if (Test-Path $storage) {
    Write-Host "`n========== Storage (Email Accounts) =========="
    Get-ChildItem -Path $storage -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $size = (Get-ChildItem -Path $_.FullName -Recurse -ErrorAction SilentlyContinue -Force |
                 Where-Object { -not $_.PSIsContainer } |
                 Measure-Object -Property Length -Sum).Sum
        [PSCustomObject]@{ Name = $_.Name; SizeGB = if($size){[math]::Round($size/1GB,2)}else{0} }
    } | Sort-Object SizeGB -Descending | Format-Table -AutoSize

    # For each account, show folders
    $accounts = Get-ChildItem -Path $storage -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '@' }
    foreach ($acc in $accounts) {
        $accSize = (Get-ChildItem -Path $acc.FullName -Recurse -ErrorAction SilentlyContinue -Force |
                    Where-Object { -not $_.PSIsContainer } |
                    Measure-Object -Property Length -Sum).Sum
        if ($accSize -gt 1GB) {
            Write-Host "`n===== Account: $($acc.Name) ($([math]::Round($accSize/1GB,2)) GB) ====="
            Get-ChildItem -Path $acc.FullName -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                $dSize = (Get-ChildItem -Path $_.FullName -Recurse -ErrorAction SilentlyContinue -Force |
                         Where-Object { -not $_.PSIsContainer } |
                         Measure-Object -Property Length -Sum).Sum
                [PSCustomObject]@{ Name = $_.Name; SizeGB = if($dSize){[math]::Round($dSize/1GB,2)}else{0} }
            } | Sort-Object SizeGB -Descending | Format-Table -AutoSize
        }
    }
}

# Mails folders detail for large accounts
foreach ($acc in $accounts) {
    $mailsPath = "$($acc.FullName)\Mails"
    if (Test-Path $mailsPath) {
        $mailsSize = (Get-ChildItem -Path $mailsPath -Recurse -ErrorAction SilentlyContinue -Force |
                      Where-Object { -not $_.PSIsContainer } |
                      Measure-Object -Property Length -Sum).Sum
        if ($mailsSize -gt 5GB) {
            Write-Host "`n===== $($acc.Name) Mails detail ($([math]::Round($mailsSize/1GB,2)) GB) ====="
            # Show immediate subdirs (year folders or mail folders)
            Get-ChildItem -Path $mailsPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                $subSize = (Get-ChildItem -Path $_.FullName -Recurse -ErrorAction SilentlyContinue -Force |
                           Where-Object { -not $_.PSIsContainer } |
                           Measure-Object -Property Length -Sum).Sum
                [PSCustomObject]@{ Name = $_.Name; SizeGB = if($subSize){[math]::Round($subSize/1GB,2)}else{0} }
            } | Sort-Object SizeGB -Descending | Select-Object -First 30 | Format-Table -AutoSize
        }
    }
}

# Indexes
$indexes = "$foxmail\Storage\*\Indexes"
Write-Host "`n========== Index Files Summary =========="
Get-ChildItem -Path $foxmail -Recurse -ErrorAction SilentlyContinue -Force |
    Where-Object { -not $_.PSIsContainer -and $_.Name -match '\.(rec|db|idx)$' -and $_.Length -gt 100MB } |
    Sort-Object Length -Descending |
    Select-Object -First 20 |
    ForEach-Object {
        [PSCustomObject]@{
            SizeGB = [math]::Round($_.Length/1GB, 2)
            Path = $_.FullName
        }
    } | Format-Table -AutoSize -Wrap
