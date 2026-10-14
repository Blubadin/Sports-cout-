param(
    [string]$Python = '',
    [string]$ShuttleModelPath = $env:SHUTTLE_MODEL_PATH,
    [string]$ShuttleProvider = $env:SHUTTLE_PROVIDER,
    [ValidateRange(40, 600)][int]$StartupTimeoutSec = 300
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Python) {
    $localPython = Join-Path $projectRoot '.local-services/python/Scripts/python.exe'
    if (Test-Path -LiteralPath $localPython -PathType Leaf) {
        $Python = $localPython
    } else {
        # Managed worktrees share the repository's dependency environment.
        $gitCommonDir = (& git -C $projectRoot rev-parse --path-format=absolute --git-common-dir 2>$null)
        $sharedPython = if ($LASTEXITCODE -eq 0 -and $gitCommonDir) {
            Join-Path (Split-Path -Parent $gitCommonDir.Trim()) '.local-services/python/Scripts/python.exe'
        }
        $Python = if ($sharedPython -and (Test-Path -LiteralPath $sharedPython -PathType Leaf)) {
            $sharedPython
        } else {
            'python'
        }
    }
}
$logDirectory = Join-Path $projectRoot '.local-services'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

# Reuse the existing environment contract and locally audited artifact.
# No weights are downloaded and the adapter still verifies the pinned hash.
$auditedLocalModel = Join-Path $projectRoot '.local-models/rallylens-shuttle-tracknet.pth'
if (-not $ShuttleModelPath -and -not $ShuttleProvider -and (Test-Path -LiteralPath $auditedLocalModel -PathType Leaf)) {
    $ShuttleModelPath = $auditedLocalModel
    $ShuttleProvider = 'rallylens_tracknet'
}
if ($ShuttleModelPath) {
    $resolvedModel = Resolve-Path -LiteralPath $ShuttleModelPath -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $resolvedModel.Path -PathType Leaf)) { throw 'Shuttle model must be a file.' }
    if (-not $ShuttleProvider) { throw 'Specify ShuttleProvider for an explicit model path.' }
    $env:SHUTTLE_MODEL_PATH = $resolvedModel.Path
    $env:SHUTTLE_PROVIDER = $ShuttleProvider
    Write-Output "Shuttle configuration: $ShuttleProvider / $($resolvedModel.Path) (enable tracking in the Lab)"
}

function Test-Service([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch { return $false }
}

function Get-PendingAiProcess {
    $aiScript = Join-Path $projectRoot 'ai_service/server.py'
    @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { ([string]$_.CommandLine).IndexOf($aiScript, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
}

function Assert-ExistingServiceCheckout([int]$Port, [string]$ServiceName) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) { return }

    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    $commandLine = [string]$owner.CommandLine
    # A service started with an absolute script path reveals its checkout. Reject
    # another checkout instead of reporting its healthy port as this one.
    if ($ServiceName -eq 'AI service') {
        $scriptPath = Join-Path $projectRoot 'ai_service/server.py'
        if ($commandLine -match '(?i)[A-Z]:\\[^\"]*ai_service[\\/]server\.py' -and
            $commandLine.IndexOf($scriptPath, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw "Port $Port is running an AI service from another checkout (PID $($listener.OwningProcess)). Stop that service before starting this checkout."
        }
    } else {
        if ($commandLine -match '(?i)[A-Z]:\\[^\"]*vite\.js' -and
            $commandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw "Port $Port is running a frontend from another checkout (PID $($listener.OwningProcess)). Stop it or open this checkout on a different port."
        }
    }
}

Assert-ExistingServiceCheckout 8000 'AI service'
Assert-ExistingServiceCheckout 3000 'frontend'

if (-not (Test-Service 'http://127.0.0.1:8000/api/status')) {
    if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) {
        throw 'Port 8000 is occupied by another service.'
    }
    $pendingAi = @(Get-PendingAiProcess)
    if ($pendingAi.Count -gt 0) {
        Write-Output "AI Service is still starting (PID $($pendingAi[0].ProcessId)); waiting for health check."
    } else {
        $pythonCommand = (Get-Command $Python -ErrorAction Stop).Source
        $aiScript = Join-Path $projectRoot 'ai_service/server.py'
        Start-Process -FilePath $pythonCommand -ArgumentList "`"$aiScript`"" `
            -WorkingDirectory $projectRoot -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logDirectory 'ai.stdout.log') `
            -RedirectStandardError (Join-Path $logDirectory 'ai.stderr.log') | Out-Null
    }
}

if (-not (Test-Service 'http://127.0.0.1:3000/')) {
    if (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue) {
        throw 'Port 3000 is occupied by another service.'
    }
    $nodeCommand = (Get-Command node -ErrorAction Stop).Source
    $viteScript = Join-Path $projectRoot 'node_modules/vite/bin/vite.js'
    $env:VITE_ENABLE_WORKSTATION = 'true'
    Start-Process -FilePath $nodeCommand `
        -ArgumentList "`"$viteScript`" --port 3000 --host 127.0.0.1 --strictPort" `
        -WorkingDirectory $projectRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDirectory 'web.stdout.log') `
        -RedirectStandardError (Join-Path $logDirectory 'web.stderr.log') | Out-Null
}

$startedAt = Get-Date
$deadline = $startedAt.AddSeconds($StartupTimeoutSec)
$lastNoticeAt = $startedAt
do {
    $webReady = Test-Service 'http://127.0.0.1:3000/'
    $aiReady = Test-Service 'http://127.0.0.1:8000/api/status'
    if ($webReady -and $aiReady) {
        try {
            $capabilities = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/capabilities' -TimeoutSec 30
            if (-not $capabilities.shuttle.modelAvailable) {
                if ($ShuttleModelPath) {
                    throw "The running AI service has no usable shuttle model ($($capabilities.shuttle.probeFailureReason)). Restart it with this checkout's audited model before using Shuttle Tracking."
                }
                Write-Warning "Shuttle is unavailable: $($capabilities.shuttle.probeFailureReason). Startup settings apply to new AI processes; an existing AI service may need restarting."
            } else {
                Write-Output "Shuttle artifact ready: $($capabilities.shuttle.provider) / $($capabilities.shuttle.configuredModel). Real-video quality is not certified by this readiness check."
            }
        } catch {
            if ($ShuttleModelPath) { throw }
            Write-Warning 'AI is online, but shuttle readiness could not be checked.'
        }
        Write-Output 'SportsScout: http://localhost:3000/ (Web + AI online)'
        exit 0
    }
    if (-not $aiReady -and -not (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue)) {
        $pendingAi = @(Get-PendingAiProcess)
        if ($pendingAi.Count -eq 0) {
            throw "AI Service exited before becoming ready. Inspect $logDirectory/ai.stderr.log"
        }
    }
    if (((Get-Date) - $lastNoticeAt).TotalSeconds -ge 15) {
        $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
        Write-Output "Waiting for SportsScout services (${elapsed}s): web=$webReady AI=$aiReady"
        $lastNoticeAt = Get-Date
    }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
throw "Services did not become ready within ${StartupTimeoutSec}s. Inspect logs in $logDirectory"
