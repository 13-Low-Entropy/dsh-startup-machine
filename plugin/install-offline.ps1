# ============================================================================
#  dsh-startup-machine - offline installer (no `dsh` CLI required)
#
#  Does exactly what `dsh plugin --profile <p> add link:<dir>` does:
#    1. registers the dependency  -> <profile>/package.json .dependencies
#    2. registers the bundle      -> <profile>/package.json .dsh.profile.bundles
#    3. creates the link          -> <profile>/node_modules/<name>
#  ...and additionally removes dsh-startup-screen so two startup overlays
#  do not stack.
#
#  This file is deliberately ASCII-only: it must survive being extracted into
#  a directory whose name is not ASCII.
#
#  Usage (normally you do not call this by hand - install.cmd does):
#    powershell -NoProfile -ExecutionPolicy Bypass -File install-offline.ps1
#    powershell -NoProfile -ExecutionPolicy Bypass -File install-offline.ps1 -Profile web
#    powershell -NoProfile -ExecutionPolicy Bypass -File install-offline.ps1 -Uninstall
#    ... -ProfileRoot <dir>   install into an arbitrary profile dir (for testing)
# ============================================================================
param(
  [string]$Profile    = "desktop",
  [string]$Source     = "",
  [string]$ProfileRoot = "",
  [switch]$Uninstall,
  [switch]$KeepOld
)

$ErrorActionPreference = 'Stop'
$Self   = 'dsh-startup-machine'
$Legacy = 'dsh-startup-screen'

function Say($msg) { Write-Host $msg }
function Fail($msg) { Write-Host ""; Write-Host "[ERROR] $msg"; exit 1 }

# ---- 1. resolve paths ------------------------------------------------------
if (-not $Source) { $Source = $PSScriptRoot }
if (-not $Source) { Fail "cannot determine the plugin folder; pass -Source <dir>" }
$Source = (Resolve-Path -LiteralPath $Source).Path
if (-not (Test-Path -LiteralPath (Join-Path $Source 'package.json'))) {
  Fail "no package.json in $Source - run this from the plugin folder"
}

$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
if (-not (Test-Path -LiteralPath $dshHome)) { Fail "no DSH home at $dshHome (is DSH installed?)" }

if ($ProfileRoot) {
  $profDir = $ProfileRoot
} else {
  $profDir = Join-Path (Join-Path $dshHome 'profiles') $Profile
}
$pkgPath = Join-Path $profDir 'package.json'
if (-not (Test-Path -LiteralPath $pkgPath)) { Fail "no profile at $profDir" }

Say ""
Say "  dsh-startup-machine - offline install"
Say "  plugin : $Source"
Say "  profile: $profDir"
Say ""

# ---- 2. read + patch the profile manifest ----------------------------------
# A space in the link target is legal here but risky: the value lives in a
# package.json spec, and some npm spec parsers split on whitespace. Warn only.
if ($Source -match '\s') {
  Say "  [WARN] the plugin path contains a space. It works with this installer,"
  Say "         but if the CLI path is used later it may misparse. Prefer a"
  Say "         folder without spaces, e.g. C:\dsh-plugins\dsh-startup-machine"
  Say ""
}

$raw = [System.IO.File]::ReadAllText($pkgPath, [System.Text.Encoding]::UTF8)
$pkg = $raw | ConvertFrom-Json

if (-not $pkg.PSObject.Properties['dependencies']) {
  $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{})
}
if (-not $pkg.PSObject.Properties['dsh']) {
  $pkg | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{})
}
if (-not $pkg.dsh.PSObject.Properties['profile']) {
  $pkg.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{})
}
if (-not $pkg.dsh.profile.PSObject.Properties['bundles']) {
  $pkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @()
}

# bundles as a plain array we can edit
$bundles = @()
foreach ($b in @($pkg.dsh.profile.bundles)) { if ($b) { $bundles += [string]$b } }

function Remove-Key($obj, $key) {
  $p = $obj.PSObject.Properties[$key]
  if ($p) { $obj.PSObject.Properties.Remove($key) }
}

# drop the built-in startup screen (it does the same job; two overlays stack)
$dropped = $false
if (-not $KeepOld) {
  if ($pkg.dependencies.PSObject.Properties[$Legacy]) { Remove-Key $pkg.dependencies $Legacy; $dropped = $true }
  if ($bundles -contains $Legacy) { $bundles = @($bundles | Where-Object { $_ -ne $Legacy }); $dropped = $true }
}

if ($Uninstall) {
  if ($pkg.dependencies.PSObject.Properties[$Self]) { Remove-Key $pkg.dependencies $Self }
  $bundles = @($bundles | Where-Object { $_ -ne $Self })
} else {
  # link targets always use forward slashes - backslashes are escape sequences
  # in the npm spec, and this machine's paths can contain spaces.
  $link = 'link:' + ($Source -replace '\\', '/')
  $pkg.dependencies | Add-Member -NotePropertyName $Self -NotePropertyValue $link -Force
  if ($bundles -notcontains $Self) { $bundles += $Self }
}

$pkg.dsh.profile.bundles = @($bundles)

# ---- 3. write it back (UTF-8 without BOM - a BOM breaks JSON.parse) --------
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backup = "$pkgPath.bak-$stamp"
Copy-Item -LiteralPath $pkgPath -Destination $backup -Force
Say "  backup : $backup"

$json = $pkg | ConvertTo-Json -Depth 20
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($pkgPath, $json + "`r`n", $utf8)

# ---- 4. verify the file still parses --------------------------------------
try {
  $check = [System.IO.File]::ReadAllText($pkgPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
} catch {
  Copy-Item -LiteralPath $backup -Destination $pkgPath -Force
  Fail "the rewritten package.json did not parse; rolled back from backup"
}
if (-not $Uninstall) {
  if ($check.dependencies.$Self -ne ('link:' + ($Source -replace '\\', '/'))) {
    Copy-Item -LiteralPath $backup -Destination $pkgPath -Force
    Fail "dependency entry did not stick; rolled back from backup"
  }
}

# ---- 5. node_modules link -------------------------------------------------
$nm = Join-Path $profDir 'node_modules'
if (-not (Test-Path -LiteralPath $nm)) { New-Item -ItemType Directory -Path $nm | Out-Null }
$target = Join-Path $nm $Self

if (Test-Path -LiteralPath $target) {
  $item = Get-Item -LiteralPath $target -Force
  if ($item.LinkType -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    cmd /c rmdir "`"$target`"" 2>$null
  } else {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

if (-not $Uninstall) {
  try {
    New-Item -ItemType Junction -Path $target -Target $Source -ErrorAction Stop | Out-Null
  } catch {
    # Roll the manifest back if the link cannot be created. Otherwise we leave a half
    # state: the dependency is registered but node_modules has nothing to resolve it,
    # so DSH fails to load this bundle and nobody knows which step broke.
    $msg = $_.Exception.Message
    Copy-Item -LiteralPath $backup -Destination $pkgPath -Force
    Fail ("could not create the node_modules link at " + $target + " (" + $msg + "); profile manifest rolled back from backup")
  }
  if (-not (Test-Path -LiteralPath (Join-Path $target 'package.json'))) {
    if (Test-Path -LiteralPath $target) { cmd /c rmdir "`"$target`"" 2>$null }
    Copy-Item -LiteralPath $backup -Destination $pkgPath -Force
    Fail "the link was created but does not resolve; rolled back from backup, check $target"
  }
  Say "  link   : $target"
  Say "           -> $Source"
}

# ---- 6. summary -----------------------------------------------------------
$still = $pkg.dependencies.PSObject.Properties[$Legacy]
Say ""
if ($Uninstall) {
  Say "  Removed $Self from profile '$Profile'."
} else {
  Say "  Done. $Self is registered in profile '$Profile'."
  if ($dropped) { Say "  Also removed $Legacy (it would draw a second startup overlay)." }
  if ($still)   { Say "  WARNING: $Legacy is still listed - remove it manually." }
  Say ""
  Say "  Next: restart DSH (fully quit, not just close the window)."
  Say "  Settings -> startup animation - MACHINE"
}
Say ""
exit 0
