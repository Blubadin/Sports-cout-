<#
.SYNOPSIS
    Packages SportsScout into a standalone Windows distribution ZIP archive.
.PARAMETER IncludePython
    If specified, bundles the isolated CPython runtime for 100% standalone offline deployment.
.PARAMETER SkipBuild
    If specified, skips running 'npm run build'.
.PARAMETER OutputDir
    Output directory for the generated ZIP archive (defaults to 'release').
#>
param(
    [switch]$IncludePython,
    [switch]$SkipBuild,
    [string]$OutputDir = "release"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "SportsScout Windows ZIP Package Generator" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

# 1. Build frontend if needed
$distDir = Join-Path $projectRoot "dist"
if (-not $SkipBuild -or -not (Test-Path (Join-Path $distDir "index.html"))) {
    Write-Host "[1/5] Building frontend production assets..." -ForegroundColor Yellow
    Set-Location $projectRoot
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE" }
} else {
    Write-Host "[1/5] Using existing production frontend assets in dist/..." -ForegroundColor Green
}

# 2. Prepare staging directory
Write-Host "[2/5] Staging files for package..." -ForegroundColor Yellow
$releaseDir = Join-Path $projectRoot $OutputDir
$packageVersion = "v0.11"
$folderName = if ($IncludePython) { "SportsScout-$packageVersion-Windows-Full" } else { "SportsScout-$packageVersion-Windows-Portable" }
$stagingDir = Join-Path $releaseDir "staging\$folderName"

if (Test-Path $stagingDir) {
    Remove-Item -Path $stagingDir -Recurse -Force
}
New-Item -Path $stagingDir -ItemType Directory -Force | Out-Null

# 3. Copy application payloads
Write-Host "[3/5] Copying core application payloads..." -ForegroundColor Yellow

# Copy dist
Copy-Item -Path $distDir -Destination (Join-Path $stagingDir "dist") -Recurse -Force

# Copy ai_service (excluding dev caches)
$targetAiDir = Join-Path $stagingDir "ai_service"
New-Item -Path $targetAiDir -ItemType Directory -Force | Out-Null
Get-ChildItem -Path (Join-Path $projectRoot "ai_service") | Where-Object {
    $_.Name -notin @("__pycache__", ".pytest_cache", "tests", ".coverage")
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $targetAiDir -Recurse -Force
}

# Copy models
$modelsDir = Join-Path $projectRoot ".local-models"
if (Test-Path $modelsDir) {
    Copy-Item -Path $modelsDir -Destination (Join-Path $stagingDir ".local-models") -Recurse -Force
}

# Copy assets
$assetsDir = Join-Path $projectRoot "assets"
if (Test-Path $assetsDir) {
    Copy-Item -Path $assetsDir -Destination (Join-Path $stagingDir "assets") -Recurse -Force
}

# Copy launchers and user guides
Copy-Item -Path (Join-Path $projectRoot "Run-SportsScout.cmd") -Destination $stagingDir -Force
Copy-Item -Path (Join-Path $projectRoot "Stop-SportsScout.cmd") -Destination $stagingDir -Force

$guideFiles = Get-ChildItem -Path $projectRoot -Filter "*SportsScout*.txt"
foreach ($g in $guideFiles) {
    Copy-Item -Path $g.FullName -Destination $stagingDir -Force
}

$stagingScriptsDir = Join-Path $stagingDir "scripts"
New-Item -Path $stagingScriptsDir -ItemType Directory -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot "scripts\launch-workstation.ps1") -Destination $stagingScriptsDir -Force
Copy-Item -Path (Join-Path $projectRoot "scripts\stop-workstation.ps1") -Destination $stagingScriptsDir -Force
Copy-Item -Path (Join-Path $projectRoot "scripts\create-desktop-shortcut.ps1") -Destination $stagingScriptsDir -Force

# Create data directories
New-Item -Path (Join-Path $stagingDir "data\exports") -ItemType Directory -Force | Out-Null
New-Item -Path (Join-Path $stagingDir "data\logs") -ItemType Directory -Force | Out-Null
New-Item -Path (Join-Path $stagingDir "data\projects") -ItemType Directory -Force | Out-Null

# Optional Python runtime bundle
if ($IncludePython) {
    Write-Host "       Bundling isolated Python runtime (this may take a few moments)..." -ForegroundColor Yellow
    $pySource = Join-Path $projectRoot ".local-services\python"
    if (Test-Path $pySource) {
        $pyTarget = Join-Path $stagingDir ".local-services\python"
        New-Item -Path (Join-Path $stagingDir ".local-services") -ItemType Directory -Force | Out-Null
        Copy-Item -Path $pySource -Destination $pyTarget -Recurse -Force
    } else {
        Write-Warning "Local Python environment not found at $pySource"
    }
}

# 4. Create ZIP archive
Write-Host "[4/5] Compressing package into ZIP archive..." -ForegroundColor Yellow
$zipFileName = "$folderName.zip"
$zipFilePath = Join-Path $releaseDir $zipFileName

if (Test-Path $zipFilePath) {
    Remove-Item -Path $zipFilePath -Force
}

Compress-Archive -Path $stagingDir -DestinationPath $zipFilePath -CompressionLevel Optimal

# 5. Calculate SHA256 checksum
Write-Host "[5/5] Generating cryptographic SHA-256 verification hash..." -ForegroundColor Yellow
$hash = (Get-FileHash -Path $zipFilePath -Algorithm SHA256).Hash
$checksumFile = Join-Path $releaseDir "SHA256SUMS.txt"
"$hash  $zipFileName" | Out-File -FilePath $checksumFile -Encoding ascii -Append

$zipSizeMb = [math]::Round((Get-Item $zipFilePath).Length / 1MB, 2)

Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "SUCCESS: Package generated successfully!" -ForegroundColor Green
Write-Host "Archive: $zipFilePath" -ForegroundColor Green
Write-Host "Size:    $zipSizeMb MB" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
