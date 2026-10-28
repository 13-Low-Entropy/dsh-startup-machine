# dsh-startup-machine - uninstaller (ASCII only; see README.md)
# Version is read from plugin\package.json - do not hardcode it here.
#
# Removes the plugin from the profile, the logon guard, and (optionally) restores
# the original app.asar from the newest camera-patch backup.
#
# Security (1.2.5): -RestoreAsar only restores a backup whose size and SHA-256
# match the install-time manifest (app.asar.camera-backup.json) written by
# patch_camera.py. A backup planted after the fact is skipped. Pass -Force to
# restore an unverified legacy backup (no manifest) anyway.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1 [-Profile desktop] [-RestoreAsar] [-Force] [-KeepTools] [-SkipGuard]
param(
  [string]$Profile = 'desktop',
  [switch]$RestoreAsar,
  [switch]$Force,
  [switch]$KeepTools,
  [switch]$SkipGuard
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Say([string]$m) { Write-Host $m }
function Step([string]$m) { Write-Host ''; Write-Host ('== ' + $m) }
function Fail([string]$m) { Write-Host ''; Write-Host ('[ERROR] ' + $m); exit 1 }

# Single source of truth for the version: plugin\package.json (same as the installer
# and the settings panel footer).
function Get-MsVersion {
  param([string]$Base)
  $pkg = Join-Path $Base 'plugin\package.json'
  if (-not (Test-Path -LiteralPath $pkg)) { return 'unknown' }
  try {
    $v = (Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 | ConvertFrom-Json).version
    if ($v) { return [string]$v }
  } catch { }
  return 'unknown'
}
$msVersion = Get-MsVersion -Base $root

# Locate the DSH desktop "resources" directory holding app.asar (same search order
# as install.ps1 / patch_camera.py).
function Find-DshResources {
  $candidates = @()
  if ($env:DSH_DESKTOP_ASAR) { $candidates += (Split-Path -Parent $env:DSH_DESKTOP_ASAR) }
  if ($env:DSH_DESKTOP_DIR) { $candidates += (Join-Path $env:DSH_DESKTOP_DIR 'resources') }
  $patterns = @('D:\deepseek\*\resources', 'C:\Program Files\*\resources', 'C:\Program Files (x86)\*\resources')
  if ($env:LOCALAPPDATA) { $patterns += (Join-Path $env:LOCALAPPDATA 'Programs\*\resources') }
  foreach ($pat in $patterns) {
    foreach ($hit in (Get-ChildItem -Path $pat -Directory -ErrorAction SilentlyContinue)) {
      if (Test-Path -LiteralPath (Join-Path $hit.FullName 'app.asar')) { $candidates += $hit.FullName }
    }
  }
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath (Join-Path $c 'app.asar'))) { return $c }
  }
  return $null
}

$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
Say ''
Say ('  dsh-startup-machine ' + $msVersion + ' - uninstaller')

# ------------------------------------------------------------- 1. plugin
Step '1/3 remove plugin from the profile'
$destPlugin = Join-Path $dshHome 'plugin-sources\dsh-startup-machine'
$source = if (Test-Path -LiteralPath (Join-Path $destPlugin 'package.json')) { $destPlugin } else { Join-Path $root 'plugin' }
$offline = Join-Path $root 'plugin\install-offline.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $offline -Profile $Profile -Source $source -Uninstall
if ($LASTEXITCODE -ne 0) { Say ('  [WARN] profile cleanup reported exit ' + $LASTEXITCODE) }

$nm = Join-Path $dshHome ('profiles\' + $Profile + '\node_modules\dsh-startup-machine')
if (Test-Path -LiteralPath $nm) {
  cmd /c rmdir "`"$nm`"" 2>$null
  Say ('  junction removed: ' + $nm)
}
if (Test-Path -LiteralPath $destPlugin) {
  Remove-Item -LiteralPath $destPlugin -Recurse -Force
  Say ('  plugin source removed: ' + $destPlugin)
}

# ------------------------------------------------------------- 2. guard
Step '2/3 remove the logon guard'
if ($SkipGuard) {
  Say '  guard removal skipped (-SkipGuard)'
} else {
  $vbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'DSH-Camera-Patch-Guard.vbs'
  if (Test-Path -LiteralPath $vbs) { Remove-Item -LiteralPath $vbs -Force; Say ('  removed: ' + $vbs) }
  else { Say '  guard not installed' }

  # 1.2.5 installs the guard next to app.asar; remove it from there.
  $resDir = Find-DshResources
  if ($resDir) {
    $guardDir = Join-Path $resDir 'dsh-startup-machine-guard'
    if (Test-Path -LiteralPath $guardDir) {
      Remove-Item -LiteralPath $guardDir -Recurse -Force
      Say ('  guard scripts removed: ' + $guardDir)
    }
  }

  # Legacy (1.2.4 and earlier) user-profile copies.
  $tools = Join-Path $dshHome 'camera-patch'
  if ((-not $KeepTools) -and (Test-Path -LiteralPath $tools)) {
    Remove-Item -LiteralPath $tools -Recurse -Force
    Say ('  tools removed: ' + $tools)
  } elseif ($KeepTools) {
    Say ('  tools kept: ' + $tools)
  }
}

# -------------------------------------------------------- 3. camera patch
Step '3/3 camera permission patch'
if ($RestoreAsar) {
  # Where can the backup be? Collect every candidate "resources" directory first.
  # This mirrors CANDIDATE_GLOBS in patch_camera.py, including per-user installs.
  $resList = New-Object System.Collections.ArrayList
  function Add-ResDir([string]$dir) {
    if (-not $dir) { return }
    if (-not (Test-Path -LiteralPath $dir)) { return }
    $full = (Resolve-Path -LiteralPath $dir).Path
    if (-not $resList.Contains($full)) { [void]$resList.Add($full) }
  }

  if ($env:DSH_DESKTOP_ASAR) { Add-ResDir (Split-Path -Parent $env:DSH_DESKTOP_ASAR) }
  if ($env:DSH_DESKTOP_DIR) { Add-ResDir (Join-Path $env:DSH_DESKTOP_DIR 'resources') }
  foreach ($p in @('D:\deepseek', 'C:\Program Files', 'C:\Program Files (x86)')) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    foreach ($dir in (Get-ChildItem -LiteralPath $p -Directory -ErrorAction SilentlyContinue)) {
      Add-ResDir (Join-Path $dir.FullName 'resources')
    }
  }
  $userPrograms = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs' } else { '' }
  if ($userPrograms -and (Test-Path -LiteralPath $userPrograms)) {
    foreach ($dir in (Get-ChildItem -LiteralPath $userPrograms -Directory -ErrorAction SilentlyContinue)) {
      Add-ResDir (Join-Path $dir.FullName 'resources')
    }
  }

  $verified = @()
  $unverified = @()
  $mismatch = 0
  foreach ($res in $resList) {
    $target = Join-Path $res 'app.asar'
    if (-not (Test-Path -LiteralPath $target)) { continue }
    # Sort by name, not LastWriteTime: shutil.copy2 keeps the source mtime, so
    # mtime order can pick an older copy; the name carries the timestamp.
    $bak = Get-ChildItem -LiteralPath $res -Filter 'app.asar.bak-camera-*' -File -ErrorAction SilentlyContinue |
           Sort-Object Name -Descending | Select-Object -First 1
    if (-not $bak) { continue }

    $manifestPath = Join-Path $res 'app.asar.camera-backup.json'
    $manifest = $null
    if (Test-Path -LiteralPath $manifestPath) {
      try { $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $manifest = $null }
    }
    if (-not $manifest) {
      $unverified += ,@($res, $target, $bak.FullName)
      continue
    }

    $expectedName = [string]$manifest.backup
    $expectedSha = ([string]$manifest.sha256).ToLower()
    $expectedSize = [int64]$manifest.size
    $actualSize = [int64]$bak.Length
    $actualSha = (Get-FileHash -LiteralPath $bak.FullName -Algorithm SHA256).Hash.ToLower()
    if ($bak.Name -ne $expectedName -or $actualSize -ne $expectedSize -or $actualSha -ne $expectedSha) {
      Say ('  [WARN] backup does not match the install-time manifest - skipped: ' + $bak.FullName)
      Say ('         manifest expects ' + $expectedName + ' (' + $expectedSize + ' bytes)')
      $mismatch++
      continue
    }
    $verified += ,@($target, $bak.FullName)
  }

  $pick = $null
  if ($verified.Count -gt 0) {
    $pick = $verified[0]
    if ($verified.Count -gt 1) {
      Say ('  [WARN] found ' + $verified.Count + ' verified backups; restoring the first one only:')
      foreach ($f in $verified) { Say ('         ' + $f[0]) }
    }
  } elseif ($mismatch -gt 0) {
    Say '  [ERROR] the backup does not match the install-time SHA-256 manifest.'
    Say '  refusing to overwrite app.asar (this is exactly the poisoned-backup case).'
    Say '  If you are sure the manifest is stale, delete the backup/manifest and re-apply the patch.'
    exit 1
  } elseif ($unverified.Count -gt 0 -and $Force) {
    Say '  [WARN] -Force: restoring an UNVERIFIED backup (no install-time manifest):'
    Say ('         ' + $unverified[0][2])
    $pick = @($unverified[0][1], $unverified[0][2])
  } elseif ($unverified.Count -gt 0) {
    Say '  [ERROR] backup found but it has no install-time manifest, so it cannot be verified:'
    Say ('          ' + $unverified[0][1])
    Say '  refusing to overwrite app.asar with an unverified backup.'
    Say '  Re-run the installer once (it records the manifest), or pass -Force to restore anyway.'
    exit 1
  } else {
    Say '  no camera-patch backup found; the patch was probably never applied'
    Say ('  searched: ' + ($resList -join '; '))
    Say '  if you know the asar path, set DSH_DESKTOP_ASAR and run this again'
  }

  if ($pick) {
    $target, $backup = $pick
    Say '  Close DeepSeek Harness completely before restoring!'
    try {
      Copy-Item -LiteralPath $backup -Destination $target -Force -ErrorAction Stop
      Say ('  restored ' + $target)
      Say ('  from     ' + $backup)
    } catch {
      Say '  [ERROR] could not restore app.asar (is DeepSeek Harness still running?):'
      Say ('          ' + $_.Exception.Message)
      Say ('          your backup is untouched: ' + $backup)
      exit 1
    }
  }
} else {
  Say '  left in place (camera permissions stay enabled).'
  Say '  pass -RestoreAsar to restore the original app.asar instead.'
}

Say ''
Say '  Done. Fully restart DeepSeek Harness for the changes to take effect.'
Say ('  Your configuration file was kept: ' + (Join-Path $dshHome 'dsh-startup-machine.json'))
Say ''
exit 0
