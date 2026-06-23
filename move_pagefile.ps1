Write-Host "Current pagefile settings:"
Get-CimInstance Win32_PageFileSetting | ForEach-Object {
    Write-Host "  $($_.Name) | Initial: $($_.InitialSize) MB | Max: $($_.MaximumSize) MB"
}

Write-Host "`nRemoving all pagefiles..."
Get-CimInstance Win32_PageFileSetting | Remove-CimInstance -Verbose

Write-Host "`nCreating new pagefile on C: (2048 MB - 4096 MB)..."
# Need a small delay for the delete to take effect
Start-Sleep -Seconds 2

# Use wmic for creation (more reliable)
$result = wmic pagefileset create name="C:\pagefile.sys",InitialSize=2048,MaximumSize=4096 2>&1
Write-Host $result

Write-Host "`nNew pagefile settings:"
Get-CimInstance Win32_PageFileSetting | ForEach-Object {
    Write-Host "  $($_.Name) | Initial: $($_.InitialSize) MB | Max: $($_.MaximumSize) MB"
}

Write-Host "`nDone! Please restart your computer for changes to take effect."
Write-Host "D:\pagefile.sys will be removed after reboot."
