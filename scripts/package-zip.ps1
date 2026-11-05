<#
.SYNOPSIS
    Packages SportsScout into a standalone Windows distribution ZIP archive.
.PARAMETER IncludePython
    If specified, bundles the isolated relocatable CPython runtime for 100% standalone offline deployment.
.PARAMETER SkipVerify
    If specified, skips the mandatory 4-part verification suite (typecheck, lint, vitest, python unittest).
    FOR LOCAL DEVELOPMENT TESTING ONLY.
.PARAMETER SkipBuild
    If specified, skips running 'npm run build'.
.PARAMETER OutputDir
    Output directory for the generated ZIP archive (defaults to 'release').
#>
param(
    [switch]$IncludePython,
    [switch]$SkipVerify,
    [switch]$SkipBuild,
    [string]$OutputDir = "release"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "SportsScout Windows ZIP Package Generator" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

# 0. Verification Gate Enforcement
if (-not $SkipVerify) {
    Write-Host "[1/6] Running mandatory pre-release verification gates..." -ForegroundColor Yellow
    Set-Location $projectRoot

    Write-Host "       [1/4] Running TypeScript typecheck..." -ForegroundColor Cyan
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "Verification failed at npm run typecheck (exit code $LASTEXITCODE)" }

    Write-Host "       [2/4] Running ESLint with baseline..." -ForegroundColor Cyan
    & npm run lint
    if ($LASTEXITCODE -ne 0) { throw "Verification failed at npm run lint (exit code $LASTEXITCODE)" }

    Write-Host "       [3/4] Running Vitest unit tests..." -ForegroundColor Cyan
    & npx vitest run
    if ($LASTEXITCODE -ne 0) { throw "Verification failed at npx vitest run (exit code $LASTEXITCODE)" }

    Write-Host "       [4/4] Running Python unittest discovery..." -ForegroundColor Cyan
    $localPy = Join-Path $projectRoot ".local-services\python\Scripts\python.exe"
    $pyTestExe = if (Test-Path -LiteralPath $localPy) { $localPy } else { "python" }
    & $pyTestExe -m unittest discover -s ai_service/tests -p "test_*.py"
    if ($LASTEXITCODE -ne 0) { throw "Verification failed at python unittest discover (exit code $LASTEXITCODE)" }

    Write-Host "       All verification gates passed cleanly." -ForegroundColor Green
} else {
    Write-Host "=====================================================================" -ForegroundColor Yellow
    Write-Host "WARNING: VERIFICATION GATES SKIPPED (-SkipVerify). DEV USE ONLY!" -ForegroundColor Yellow
    Write-Host "DO NOT DISTRIBUTE PACKAGES PRODUCED WITH -SkipVerify." -ForegroundColor Yellow
    Write-Host "=====================================================================" -ForegroundColor Yellow
}

# 1. Build frontend if needed
$distDir = Join-Path $projectRoot "dist"
if (-not $SkipBuild -or -not (Test-Path (Join-Path $distDir "index.html"))) {
    Write-Host "[2/6] Building frontend production assets..." -ForegroundColor Yellow
    Set-Location $projectRoot
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE" }
} else {
    Write-Host "[2/6] Using existing production frontend assets in dist/..." -ForegroundColor Green
}

# 2. Prepare staging directory
Write-Host "[3/6] Staging files for package..." -ForegroundColor Yellow
$releaseDir = Join-Path $projectRoot $OutputDir

$pkgJsonPath = Join-Path $projectRoot "package.json"
if (-not (Test-Path $pkgJsonPath)) { throw "package.json not found at $pkgJsonPath" }
$pkgJson = Get-Content -Raw $pkgJsonPath | ConvertFrom-Json
$packageVersion = "v$($pkgJson.version)"

$folderName = if ($IncludePython) { "SportsScout-$packageVersion-Windows-Full" } else { "SportsScout-$packageVersion-Windows-Portable" }
$stagingDir = Join-Path $releaseDir "staging\$folderName"

if (Test-Path $stagingDir) {
    Remove-Item -Path $stagingDir -Recurse -Force
}
New-Item -Path $stagingDir -ItemType Directory -Force | Out-Null

# 3. Copy application payloads
Write-Host "[4/6] Copying core application payloads..." -ForegroundColor Yellow

# Copy dist
Copy-Item -Path $distDir -Destination (Join-Path $stagingDir "dist") -Recurse -Force

# Copy ai_service (excluding dev caches and tests)
$targetAiDir = Join-Path $stagingDir "ai_service"
New-Item -Path $targetAiDir -ItemType Directory -Force | Out-Null
Get-ChildItem -Path (Join-Path $projectRoot "ai_service") | Where-Object {
    $_.Name -notin @("__pycache__", ".pytest_cache", "tests", ".coverage")
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $targetAiDir -Recurse -Force
}

# Verify and copy models in allowlist only
$modelsManifest = Join-Path $projectRoot "scripts\models.sha256"
if (-not (Test-Path -LiteralPath $modelsManifest)) {
    throw "Model integrity manifest not found at $modelsManifest"
}
Write-Host "       Verifying model weights integrity against models.sha256..." -ForegroundColor Cyan
$manifestLines = Get-Content -Path $modelsManifest | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith("#") }
$allowedModels = @{}
foreach ($line in $manifestLines) {
    $parts = $line.Trim() -split '\s+', 2
    if ($parts.Length -eq 2) {
        $allowedModels[$parts[1].Trim()] = $parts[0].Trim().ToLower()
    }
}

$stagingModelsDir = Join-Path $stagingDir ".local-models"
New-Item -Path $stagingModelsDir -ItemType Directory -Force | Out-Null

$localModelsDir = Join-Path $projectRoot ".local-models"
foreach ($modelFile in $allowedModels.Keys) {
    $sourceFile = Join-Path $localModelsDir $modelFile
    if (-not (Test-Path -LiteralPath $sourceFile)) {
        throw "Required model weight file '$modelFile' missing in $localModelsDir"
    }
    $actualHash = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash.ToLower()
    $expectedHash = $allowedModels[$modelFile]
    if ($actualHash -ne $expectedHash) {
        throw "Model weight '$modelFile' cryptographic hash mismatch! Expected: $expectedHash, Actual: $actualHash"
    }
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $stagingModelsDir $modelFile) -Force
    Write-Host "       [Verified] $modelFile matches baseline SHA-256." -ForegroundColor Gray
}
Copy-Item -LiteralPath $modelsManifest -Destination (Join-Path $stagingModelsDir "models.sha256") -Force

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
    Write-Host "       Checking Python runtime for standalone distribution..." -ForegroundColor Yellow
    $pySource = Join-Path $projectRoot "payload\python"
    if (-not (Test-Path $pySource)) {
        $pySource = Join-Path $projectRoot ".local-services\python"
    }

    if (Test-Path -LiteralPath (Join-Path $pySource "pyvenv.cfg")) {
        throw "Cannot bundle Python virtual environment ($pySource) into a standalone release package: pyvenv.cfg binds to machine-specific absolute paths. Standalone offline deployment requires ZIP-2 (relocatable standalone Python + offline wheels)."
    }

    if (Test-Path -LiteralPath (Join-Path $pySource "python.exe")) {
        $pyTarget = Join-Path $stagingDir "payload\python"
        New-Item -Path (Join-Path $stagingDir "payload") -ItemType Directory -Force | Out-Null
        Copy-Item -Path $pySource -Destination $pyTarget -Recurse -Force
        Write-Host "       Bundled relocatable Python runtime." -ForegroundColor Green
    } else {
        throw "Standalone Python runtime not found at $pySource"
    }
}

# 4. Create ZIP archive
Write-Host "[5/6] Compressing package into ZIP archive..." -ForegroundColor Yellow
$zipFileName = "$folderName.zip"
$zipFilePath = Join-Path $releaseDir $zipFileName

if (Test-Path $zipFilePath) {
    Remove-Item -Path $zipFilePath -Force
}

Compress-Archive -Path $stagingDir -DestinationPath $zipFilePath -CompressionLevel Optimal

# 5. Calculate SHA256 checksum (overwrite cleanly, do not append)
Write-Host "[6/6] Generating cryptographic SHA-256 verification hash..." -ForegroundColor Yellow
$hash = (Get-FileHash -Path $zipFilePath -Algorithm SHA256).Hash
$checksumFile = Join-Path $releaseDir "SHA256SUMS.txt"
"$hash  $zipFileName" | Set-Content -Path $checksumFile -Encoding ascii

$zipSizeMb = [math]::Round((Get-Item $zipFilePath).Length / 1MB, 2)

Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "SUCCESS: Package generated successfully!" -ForegroundColor Green
Write-Host "Archive: $zipFilePath" -ForegroundColor Green
Write-Host "Size:    $zipSizeMb MB" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
