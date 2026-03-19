# CCからの提案に基づく、Node.js 64bit化後の環境再構築スクリプト
# 使い方：64bit版のNode.jsインストール後、PowerShell管理者権限で実行
chcp 65001 >$null

Write-Host "========================================="
Write-Host "Claw-Empire 依存関係クリーンアップ＆再構築"
Write-Host "========================================="

# 1. アーキテクチャの確認
$arch = node -p "process.arch"
if ($arch -ne "x64") {
    Write-Host "WARNING: Current Node.js architecture is $arch." -ForegroundColor Yellow
    Write-Host "Will continue, but lightningcss errors may persist." -ForegroundColor Yellow
    $response = Read-Host "Continue? (y/n)"
    if ($response -notmatch "^y$") {
        exit
    }
} else {
    Write-Host "OK: Node.js 64-bit (x64) detected." -ForegroundColor Green
}

cd C:\.agent\claw-empire

# 2. ポートの強制解放
Write-Host "Stopping port 8790, 8800 processes..."
Get-NetTCPConnection -LocalPort 8790,8800 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }

# 3. 古い依存関係の削除
Write-Host "Removing old node_modules..."
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force node_modules
}

Write-Host "Removing old pnpm-lock.yaml..."
if (Test-Path "pnpm-lock.yaml") {
    Remove-Item -Force pnpm-lock.yaml
}

# 4. pnpm キャッシュのクリアと再インストール
Write-Host "Pruning pnpm store..."
pnpm store prune

Write-Host "Reinstalling dependencies cleanly..."
pnpm install

Write-Host "========================================="
Write-Host "DONE!" -ForegroundColor Green
Write-Host "Please start C:\.agent\codex-dispatcher\_Run_Empire.bat"
Write-Host "========================================="
pause
