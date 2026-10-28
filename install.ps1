# dsh-startup-machine - installer (ASCII only; see README.md for the Chinese guide)
# Version is read from plugin\package.json - do not hardcode it here.
#
# Steps:
#   1. copy the plugin to a stable place (<DSH_HOME>\plugin-sources\dsh-startup-machine)
#      and register it in the desktop profile (dependency + bundle + junction)
#   2. apply the camera media-permission patch to the DSH desktop app.asar
#   3. install the logon guard that re-applies the patch after a DSH update
#   4. install the default configuration (identity, camera on) if none exists
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 [-Profile desktop] [-ForceConfig]
#   or double-click the packaged cmd wrapper.
param(
  [string]$Profile = 'desktop',
  [switch]$SkipCameraPatch,
  [switch]$SkipGuard,
  [switch]$ForceConfig
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# ---------------------------------------------------------------------------
# Single source of truth for the version: plugin\package.json.
# The install banner, the uninstall banner, the settings-panel footer and the
# VERSION.txt assertion all read it from here. Never hardcode a version string
# again: this script used to say 1.2.3, the cmd banners said 1.4.0 and the panel
# fell back to 1.5.0 - and the troubleshooting table tells people to identify a
# wrong install by the version they see.
# ---------------------------------------------------------------------------
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

function Say([string]$m) { Write-Host $m }
function Step([string]$m) { Write-Host ''; Write-Host ('== ' + $m) }
function Fail([string]$m) { Write-Host ''; Write-Host ('[ERROR] ' + $m); exit 1 }

$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
if (-not (Test-Path -LiteralPath $dshHome)) { Fail ("no DSH home at " + $dshHome + " - install DeepSeek Harness first") }

function Find-Python {
  $candidates = @()
  if ($env:DSH_DESKTOP_DIR) { $candidates += (Join-Path $env:DSH_DESKTOP_DIR 'resources\runtime\primary-runtime\dependencies\python\python.exe') }
  foreach ($p in @('D:\deepseek', 'C:\Program Files', 'C:\Program Files (x86)')) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    foreach ($dir in (Get-ChildItem -LiteralPath $p -Directory -ErrorAction SilentlyContinue)) {
      $candidates += (Join-Path $dir.FullName 'resources\runtime\primary-runtime\dependencies\python\python.exe')
    }
  }
  if ($env:LOCALAPPDATA) {
    $userPrograms = Join-Path $env:LOCALAPPDATA 'Programs'
    if (Test-Path -LiteralPath $userPrograms) {
      foreach ($dir in (Get-ChildItem -LiteralPath $userPrograms -Directory -ErrorAction SilentlyContinue)) {
        $candidates += (Join-Path $dir.FullName 'resources\runtime\primary-runtime\dependencies\python\python.exe')
      }
    }
  }
  foreach ($rt in (Get-ChildItem -LiteralPath (Join-Path $dshHome 'dsh-runtimes') -Directory -ErrorAction SilentlyContinue)) {
    $candidates += (Join-Path $rt.FullName 'dependencies\python\python.exe')
  }
  foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return $c } }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()
}

# Locate the DSH desktop "resources" directory (the one holding app.asar). The
# guard scripts are installed next to it, so they inherit the app's ACL: an
# admin-installed DSH protects them from a user-level attacker. Mirrors the
# search order used by patch_camera.py / uninstall.ps1.
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

Say ''
Say ('  dsh-startup-machine ' + $msVersion + ' - installer')
Say ('  dsh home : ' + $dshHome)
Say ('  profile  : ' + $Profile)
Say ('  package  : ' + $root)

# ---------------------------------------------------------------- 1. plugin
Step '1/4 install plugin into the profile'
$pluginSrc = Join-Path $root 'plugin'
if (-not (Test-Path -LiteralPath (Join-Path $pluginSrc 'package.json'))) { Fail 'package is incomplete: plugin\package.json missing' }
# The face-mesh model (~13 MB) fails silently when missing - tracking just falls back
# to the skin detector - so say something about it up front.
$mpModel = Join-Path $pluginSrc 'assets\mp\face_landmarker.task'
$mpWasm = Join-Path $pluginSrc 'assets\mp\wasm\vision_wasm_internal.wasm'
if (-not (Test-Path -LiteralPath $mpModel) -or -not (Test-Path -LiteralPath $mpWasm)) {
  Say '  [WARN] face mesh model missing (plugin\assets\mp) - tracking will fall back to skin mode.'
}

$destPlugin = Join-Path $dshHome 'plugin-sources\dsh-startup-machine'
if (Test-Path -LiteralPath $destPlugin) { Remove-Item -LiteralPath $destPlugin -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destPlugin) | Out-Null
Copy-Item -LiteralPath $pluginSrc -Destination $destPlugin -Recurse -Force
Say ('  plugin copied to ' + $destPlugin)

$offline = Join-Path $root 'plugin\install-offline.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $offline -Profile $Profile -Source $destPlugin
if ($LASTEXITCODE -ne 0) { Fail "plugin registration failed (exit $LASTEXITCODE)" }
Say '  plugin registered'

# ---------------------------------------------------------- 2. camera patch
if (-not $SkipCameraPatch) {
  Step '2/4 apply camera permission patch'
  $py = Find-Python
  if (-not $py) {
    Say '  [WARN] python not found - skipping the camera patch.'
    Say '         Run camera-patch\patch_camera.py manually later if needed.'
  } else {
    & $py (Join-Path $root 'camera-patch\patch_camera.py') --apply
    if ($LASTEXITCODE -ne 0) {
      Say '  [WARN] camera patch did not apply (see message above). The animation still works;'
      Say '         it will fall back to the simulated feed.'
    } else {
      Say '  camera permission patch applied (takes effect after a full DSH restart)'
    }
  }
} else {
  Say ''
  Say '  camera patch skipped (-SkipCameraPatch)'
}

# --------------------------------------------------------------- 3. guard
if (-not $SkipGuard) {
  Step '3/4 install the logon guard'
  $startup = [Environment]::GetFolderPath('Startup')
  $vbs = Join-Path $startup 'DSH-Camera-Patch-Guard.vbs'
  $tools = Join-Path $dshHome 'camera-patch'

  # Guard scripts go next to app.asar (same ACL as the app), NOT under the user
  # profile: a user-writable script executed at every logon is a persistence
  # target for any process that can write the user profile.
  $resDir = Find-DshResources
  $guardDir = $null
  if ($resDir) {
    $candidate = Join-Path $resDir 'dsh-startup-machine-guard'
    try {
      New-Item -ItemType Directory -Force -Path $candidate -ErrorAction Stop | Out-Null
      $probe = Join-Path $candidate '.write-probe'
      [System.IO.File]::WriteAllText($probe, 'probe')
      Remove-Item -LiteralPath $probe -Force
      $guardDir = $candidate
    } catch {
      Say ('  [WARN] cannot write ' + $candidate + ' (' + $_.Exception.Message + ')')
    }
  }
  if (-not $guardDir) {
    $guardDir = $tools
    Say '  [WARN] guard scripts fall back to <DSH_HOME>\camera-patch (user-writable).'
    Say '         SHA-256 verification still runs, but a same-user attacker could rewrite both file and manifest.'
  }
  New-Item -ItemType Directory -Force -Path $guardDir | Out-Null
  Copy-Item -Path (Join-Path $root 'camera-patch\*') -Destination $guardDir -Recurse -Force

  $guardScript = Join-Path $guardDir 'verify_and_repatch.ps1'
  $guardHash = Get-Sha256 $guardScript
  $manifest = [ordered]@{
    'plugin_version'         = $msVersion
    'created'                = (Get-Date).ToString('s')
    'verify_and_repatch.ps1' = $guardHash
    'patch_camera.py'        = (Get-Sha256 (Join-Path $guardDir 'patch_camera.py'))
  }
  $manifestPath = Join-Path $guardDir 'guard-manifest.json'
  [System.IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json) + "`r`n"), (New-Object System.Text.UTF8Encoding($false)))

  # 1.2.4 and earlier kept the executable guard logic under the user profile.
  # Remove those copies so the old user-writable script can no longer run.
  if ($guardDir -ne $tools) {
    foreach ($legacyName in @('verify_and_repatch.ps1', 'patch_camera.py')) {
      $legacyPath = Join-Path $tools $legacyName
      if (Test-Path -LiteralPath $legacyPath) {
        try { Remove-Item -LiteralPath $legacyPath -Force; Say ('  legacy guard script removed: ' + $legacyPath) } catch { }
      }
    }
  }

  # The launcher verifies the guard script's SHA-256 with certutil before running
  # it, so a tampered script is a silent no-op. The body is ASCII unless the
  # install path itself is non-ASCII; then WSH's guaranteed encoding (UTF-16LE)
  # is used instead.
  $escapedScript = $guardScript.Replace('"', '""')
  $content = "' Runs the DSH camera patch guard hidden at logon." + "`r`n" +
             "' Verifies SHA-256 of the guard script before running it (tampered = silent no-op)." + "`r`n" +
             'Set sh = CreateObject("WScript.Shell")' + "`r`n" +
             'Set fso = CreateObject("Scripting.FileSystemObject")' + "`r`n" +
             'script = "' + $escapedScript + '"' + "`r`n" +
             'expected = "' + $guardHash + '"' + "`r`n" +
             'If Not fso.FileExists(script) Then WScript.Quit 0' + "`r`n" +
             'On Error Resume Next' + "`r`n" +
             'Set exec = sh.Exec("certutil -hashfile """ & script & """ SHA256")' + "`r`n" +
             'If Err.Number <> 0 Then WScript.Quit 1' + "`r`n" +
             'out = exec.StdOut.ReadAll' + "`r`n" +
             'On Error GoTo 0' + "`r`n" +
             'Set re = New RegExp' + "`r`n" +
             're.Pattern = "[0-9a-fA-F]{64}"' + "`r`n" +
             're.Global = True' + "`r`n" +
             'Set m = re.Execute(out)' + "`r`n" +
             'If m.Count = 0 Then WScript.Quit 0' + "`r`n" +
             'If LCase(m(0).Value) <> expected Then WScript.Quit 0' + "`r`n" +
             'sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """", 0, False' + "`r`n"
  try {
    if ($content -notmatch '[^\x00-\x7F]') {
      [System.IO.File]::WriteAllText($vbs, $content, (New-Object System.Text.UTF8Encoding($false)))
    } else {
      [System.IO.File]::WriteAllText($vbs, $content, [System.Text.Encoding]::Unicode)
    }
    Say ('  guard installed: ' + $vbs)
    Say ('  guard scripts  : ' + $guardDir)
    Say ('  guard sha256   : ' + $guardHash)
  } catch {
    Say ('  [WARN] could not write the logon guard: ' + $_.Exception.Message)
    Say '         The camera patch still works now; only the re-patch after a DSH update is missing.'
    Say '         Re-run this installer later, or run the guard script by hand.'
  }
} else {
  Say ''
  Say '  logon guard skipped (-SkipGuard)'
}

# -------------------------------------------------------------- 4. config
Step '4/4 install default configuration'
$cfgTarget = Join-Path $dshHome 'dsh-startup-machine.json'
$cfgSource = Join-Path $root 'config\dsh-startup-machine.json'
if ((-not (Test-Path -LiteralPath $cfgTarget)) -or $ForceConfig) {
  Copy-Item -LiteralPath $cfgSource -Destination $cfgTarget -Force
  Say ('  config written: ' + $cfgTarget)
} else {
  Say ('  config kept (already exists): ' + $cfgTarget)
  Say '  pass -ForceConfig to overwrite it with the package default'
}

Say ''
Say '  Done.'
Say ''
Say '  NEXT: fully quit DeepSeek Harness (ALL processes) and start it again.'
Say '  The easiest way: double-click camera-patch\restart-dsh-camera.cmd'
Say ''
Say '  Then check: Settings -> Startup animation - MACHINE -> camera self-test.'
Say ''
exit 0
