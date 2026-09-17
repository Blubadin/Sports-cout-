param([string]$Python = 'python')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'test-results/local-services'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

function Test-Service([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch { return $false }
}

if (-not (Test-Service 'http://127.0.0.1:8000/api/status')) {
    if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) {
        throw 'Port 8000 is occupied by another service.'
    }
    $pythonCommand = (Get-Command $Python -ErrorAction Stop).Source
    Start-Process -FilePath $pythonCommand -ArgumentList 'ai_service/server.py' `
        -WorkingDirectory $projectRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDirectory 'ai.stdout.log') `
        -RedirectStandardError (Join-Path $logDirectory 'ai.stderr.log') | Out-Null
}

if (-not (Test-Service 'http://127.0.0.1:3000/')) {
    if (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue) {
        throw 'Port 3000 is occupied by another service.'
    }
    $nodeCommand = (Get-Command node -ErrorAction Stop).Source
    $env:VITE_ENABLE_WORKSTATION = 'true'
    Start-Process -FilePath $nodeCommand `
        -ArgumentList 'node_modules/vite/bin/vite.js --port 3000 --host 127.0.0.1 --strictPort' `
        -WorkingDirectory $projectRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDirectory 'web.stdout.log') `
        -RedirectStandardError (Join-Path $logDirectory 'web.stderr.log') | Out-Null
}

$deadline = (Get-Date).AddSeconds(40)
do {
    $webReady = Test-Service 'http://127.0.0.1:3000/'
    $aiReady = Test-Service 'http://127.0.0.1:8000/api/status'
    if ($webReady -and $aiReady) {
        Write-Output 'SportsScout: http://localhost:3000/ (Web + AI online)'
        exit 0
    }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
throw "Services did not become ready. Inspect logs in $logDirectory"
