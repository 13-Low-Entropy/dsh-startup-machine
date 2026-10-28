# DSH camera patch guard.
# Runs at logon: verifies that the camera media-permission patch is still present
# and re-applies it if a DSH update replaced app.asar.
#
# Security hardening (1.2.5):
#   - Installed into <DSH install>\resources\dsh-startup-machine-guard\ (a location
#     only an administrator can write when DSH is installed under Program Files).
#   - The Startup VBS launcher verifies this file's SHA-256 before invoking it.
#   - This script verifies patch_camera.py against guard-manifest.json before
#     running it, so a tampered helper is never executed.
#   - A user-writable fallback location (<DSH_HOME>\camera-patch) is used only when
#     the install directory is not writable; the installer warns in that case.
#
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$log  = Join-Path $root 'guard.log'

function Write-Log([string]$message) {
  try {
    $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $message
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
  } catch { }
}

function Get-Sha256([string]$path) {
  return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower()
}

# --- 0. integrity check of the helper BEFORE running anything ----------------
$script = Join-Path $root 'patch_camera.py'
if (-not (Test-Path -LiteralPath $script)) { Write-Log 'patch_camera.py missing; skipped'; exit 0 }

$manifestPath = Join-Path $root 'guard-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  Write-Log 'guard manifest missing; refusing to run (reinstall the plugin to restore the guard)'
  exit 1
}
try {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $expected = [string]$manifest.'patch_camera.py'
  if (-not $expected) {
    Write-Log 'guard manifest has no patch_camera.py hash; refusing to run'
    exit 1
  }
  if ((Get-Sha256 $script) -ne $expected.ToLower()) {
    Write-Log 'guard integrity check FAILED: patch_camera.py hash mismatch; refusing to run'
    exit 1
  }
} catch {
  Write-Log ('guard integrity check error; refusing to run: ' + $_.Exception.Message)
  exit 1
}

function Find-Python {
  $candidates = @()
  if ($env:DSH_DESKTOP_DIR) { $candidates += (Join-Path $env:DSH_DESKTOP_DIR 'resources\runtime\primary-runtime\dependencies\python\python.exe') }
  foreach ($p in @('D:\deepseek', 'C:\Program Files', 'C:\Program Files (x86)')) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    foreach ($dir in (Get-ChildItem -LiteralPath $p -Directory -ErrorAction SilentlyContinue)) {
      $candidates += (Join-Path $dir.FullName 'resources\runtime\primary-runtime\dependencies\python\python.exe')
    }
  }
  # Per-user installs (Electron default) live under %LOCALAPPDATA%\Programs\<app>.
  if ($env:LOCALAPPDATA) {
    $userPrograms = Join-Path $env:LOCALAPPDATA 'Programs'
    if (Test-Path -LiteralPath $userPrograms) {
      foreach ($dir in (Get-ChildItem -LiteralPath $userPrograms -Directory -ErrorAction SilentlyContinue)) {
        $candidates += (Join-Path $dir.FullName 'resources\runtime\primary-runtime\dependencies\python\python.exe')
      }
    }
  }
  foreach ($rt in (Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes') -Directory -ErrorAction SilentlyContinue)) {
    $candidates += (Join-Path $rt.FullName 'dependencies\python\python.exe')
  }
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

try {
  $py = Find-Python
  if (-not $py) { Write-Log 'python not found; skipped'; exit 0 }

  & $py $script --check *> $null
  if ($LASTEXITCODE -eq 0) { Write-Log 'patch already present; nothing to do'; exit 0 }

  Write-Log 'patch missing (DSH was probably updated); re-applying'
  $out = & $py $script --apply 2>&1
  Write-Log ('patch output: ' + ($out -join ' | '))
  if ($LASTEXITCODE -ne 0) {
    Write-Log 're-apply failed - upstream code may have changed; inspect patch_camera.py patterns'
    exit 1
  }
  Write-Log 're-applied OK; restart DSH for the camera permission to take effect'
  exit 0
} catch {
  Write-Log ('ERROR: ' + $_.Exception.Message)
  exit 1
}
