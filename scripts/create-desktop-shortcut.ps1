$projectRoot = Split-Path -Parent $PSScriptRoot
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "SportsScout.lnk"
$targetPath = Join-Path $projectRoot "Run-SportsScout.cmd"
$iconPath = Join-Path $projectRoot "assets\icon.ico"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "SportsScout Match Scouting & Video Analysis Workstation"
if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
}
$shortcut.Save()
Write-Host "[SportsScout] Successfully created desktop shortcut: $shortcutPath" -ForegroundColor Green
