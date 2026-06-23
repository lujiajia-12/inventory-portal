# Migrate JD return data from source base to target base
# Handles batching (200 per batch) and proper JSON escaping

$ErrorActionPreference = "Stop"

$sourceFile = "/tmp/source_all.json"
$targetBaseToken = "C13kbKvuwaPPcFsIj6AcRsixnff"
$targetTableId = "tbliW7mbIZpJ0SZj"
$BATCH_SIZE = 200

# Read source JSON
$raw = Get-Content $sourceFile -Raw
$json = $raw | ConvertFrom-Json
$records = $json.data.data

Write-Host "Records in this batch: $($records.Count)"

# Helper functions
function Get-Value($val) {
    if ($null -eq $val) { return $null }
    if ($val -is [array]) {
        if ($val.Count -eq 0) { return $null }
        $first = $val[0]
        if ($null -eq $first) { return $null }
        return "$first"
    }
    return "$val"
}

function Get-Number($val) {
    $v = Get-Value $val
    if ($null -eq $v) { return $null }
    $n = 0.0
    if ([double]::TryParse($v, [ref]$n)) { return [int]$n }
    return $null
}

$targetFields = @(
    "退货单号","快递单号","京东订单号","商品SKU","商品名称",
    "应退数量","收货状态","退货原因","还货商品名称","联系人",
    "运单状态","备件条码","还货快递单号","SN码"
)

# Build all rows
$allRows = [System.Collections.ArrayList]::new()
$total = 0
foreach ($rec in $records) {
    $total++
    [void]$allRows.Add(@(
        (Get-Value $rec[26]),
        (Get-Value $rec[29]),
        (Get-Value $rec[16]),
        (Get-Value $rec[10]),
        (Get-Value $rec[13]),
        (Get-Number $rec[6]),
        "待收货",
        (Get-Value $rec[1]),
        (Get-Value $rec[33]),
        (Get-Value $rec[2]),
        (Get-Value $rec[9]),
        (Get-Value $rec[3]),
        (Get-Value $rec[14]),
        (Get-Value $rec[25])
    ))
}

Write-Host "Processed $total records"

# Split into batches
$batchNum = 0
for ($i = 0; $i -lt $allRows.Count; $i += $BATCH_SIZE) {
    $batchNum++
    $batchRows = $allRows[$i..([Math]::Min($i + $BATCH_SIZE - 1, $allRows.Count - 1))]

    $payload = @{
        fields = $targetFields
        rows = @(,$batchRows)
    } | ConvertTo-Json -Depth 4 -Compress

    $payloadFile = "/tmp/migrate_batch_$batchNum.json"
    $payload | Out-File -FilePath $payloadFile -Encoding UTF8 -NoNewline

    Write-Host "Batch $batchNum : $($batchRows.Count) records -> $payloadFile"
}

Write-Host ""
Write-Host "=== COMMANDS TO RUN ==="
for ($i = 1; $i -le $batchNum; $i++) {
    Write-Host "lark-cli base +record-batch-create --base-token $targetBaseToken --table-id $targetTableId --json `"\$(cat /tmp/migrate_batch_$i.json)`" --as user"
}
