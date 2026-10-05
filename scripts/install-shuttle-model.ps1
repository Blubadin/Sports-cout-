param(
    [string]$Destination = '',
    [string]$SourcePath = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Destination) {
    $Destination = Join-Path $projectRoot '.local-models/rallylens-shuttle-tracknet.pth'
}
$Destination = [System.IO.Path]::GetFullPath($Destination)
$expectedBytes = 45431245
$expectedHash = '08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5'
$sourceUrl = 'https://raw.githubusercontent.com/YeonSeong-Lee/rallylens/98db909c5a11569e43677cdfb5e2ad1e752936d6/models/shuttle_tracknet.pth'

function Assert-Checkpoint([string]$Path) {
    $file = Get-Item -LiteralPath $Path -ErrorAction Stop
    if ($file.PSIsContainer -or $file.Length -ne $expectedBytes) {
        throw "Checkpoint must contain exactly $expectedBytes bytes."
    }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'Checkpoint does not match the audited RallyLens SHA-256.'
    }
}

if (Test-Path -LiteralPath $Destination) {
    Assert-Checkpoint $Destination
    Write-Output "Verified shuttle checkpoint already installed: $Destination"
    exit 0
}

$temporary = [System.IO.Path]::GetTempFileName()
try {
    if ($SourcePath) {
        Copy-Item -LiteralPath $SourcePath -Destination $temporary -ErrorAction Stop
    } else {
        Write-Output 'Downloading the pinned RallyLens checkpoint from GitHub...'
        Invoke-WebRequest -UseBasicParsing -Uri $sourceUrl -OutFile $temporary -TimeoutSec 300
    }
    Assert-Checkpoint $temporary
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Move-Item -LiteralPath $temporary -Destination $Destination -ErrorAction Stop
    Write-Output "Installed verified shuttle checkpoint: $Destination"
    Write-Output "SHA-256: $expectedHash"
    Write-Output 'Restart the AI service with scripts/start-local.ps1, then enable Shuttle Tracking Engine in the Lab.'
} finally {
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Force
    }
}
