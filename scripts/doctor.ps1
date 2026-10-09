param(
    [string]$Python = '',
    [ValidateSet('auto', 'cuda', 'cpu')][string]$Mode = 'auto',
    [string]$EngineConfig = '',
    [string]$ShuttleModel = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not $Python) {
    $localPython = Join-Path $projectRoot '.local-services/python/Scripts/python.exe'
    $Python = if (Test-Path -LiteralPath $localPython -PathType Leaf) { $localPython } else { 'python' }
}

# Ensure PATH includes machine and user paths
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

$doctorScript = Join-Path $projectRoot 'ai_service/runtime_doctor.py'
if (-not (Test-Path -LiteralPath $doctorScript -PathType Leaf)) {
    throw "Doctor script not found at $doctorScript"
}

Write-Output "Running SportsScout Runtime Doctor..."
$doctorArgs = @($doctorScript, '--mode', $Mode)
if ($EngineConfig) { $doctorArgs += @('--engine-config', $EngineConfig) }
if ($ShuttleModel) { $doctorArgs += @('--shuttle-model', $ShuttleModel) }
& $Python @doctorArgs
exit $LASTEXITCODE
