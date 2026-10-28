@echo off
rem ============================================================
rem  dsh-startup-machine - installer
rem
rem    install.cmd                   -> desktop profile
rem    install.cmd web               -> web profile
rem    install.cmd desktop uninstall -> remove it again
rem
rem  Two paths, tried in order:
rem    1. `dsh plugin --profile X add link:<this folder>` (official CLI)
rem    2. install-offline.ps1 - patches the profile manifest directly,
rem       for when `dsh` is not on PATH (very common on Windows).
rem
rem  Both do the same three things: register the dependency, register the
rem  bundle, create the node_modules link. Both also drop the built-in
rem  dsh-startup-screen, which would otherwise draw a second overlay.
rem
rem  Messages are English on purpose: a .cmd file is parsed in the console
rem  codepage, so non-ASCII would turn into garbage on a fresh terminal.
rem ============================================================
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
set "SRC=%CD%"

set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=desktop"
set "ACTION=%~2"

if /i "%PROFILE%"=="uninstall" (
  set "ACTION=uninstall"
  set "PROFILE=desktop"
)

echo.
echo   dsh-startup-machine
echo   folder  : %SRC%
echo   profile : %PROFILE%
if /i "%ACTION%"=="uninstall" echo   action  : uninstall
echo.

rem ---- 1. look for the CLI ------------------------------------------------
set "DSH="
where dsh >nul 2>nul
if not errorlevel 1 for /f "delims=" %%P in ('where dsh 2^>nul') do if not defined DSH set "DSH=%%P"
if not defined DSH if defined DSH_EXE if exist "%DSH_EXE%" set "DSH=%DSH_EXE%"

if not defined DSH goto offline

echo   using : %DSH%
echo.
if /i "%ACTION%"=="uninstall" (
  "%DSH%" plugin --profile %PROFILE% remove dsh-startup-machine
  echo.
  echo   Done. Restart dsh.
  goto end
)
"%DSH%" plugin --profile %PROFILE% remove dsh-startup-screen >nul 2>nul
"%DSH%" plugin --profile %PROFILE% add "link:%SRC%"
if errorlevel 1 (
  echo.
  echo   [WARN] the CLI refused. Falling back to the offline installer.
  goto offline
)
echo.
echo   Done. Restart dsh completely, then open
echo   Settings - startup animation - MACHINE.
goto end

rem ---- 2. no CLI: patch the profile manifest ourselves --------------------
:offline
echo   dsh CLI not found on PATH - using the offline installer.
echo   (set DSH_EXE=full\path\to\dsh.exe to force the CLI instead)
echo.
rem  Pass the quoted paths straight through. Do NOT assemble them into a
rem  variable first: `set "X=...""%SRC%\a.ps1""..."` leaves the doubled quotes
rem  in place, PowerShell then splits at the first space and reads a truncated
rem  -File path. (This is why a folder like "C:\my apps\plugin" used to fail.)
if /i "%ACTION%"=="uninstall" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SRC%\install-offline.ps1" -Profile %PROFILE% -Source "%SRC%" -Uninstall
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SRC%\install-offline.ps1" -Profile %PROFILE% -Source "%SRC%"
)
if errorlevel 1 (
  echo.
  echo   [ERROR] install failed. The profile manifest is restored from its
  echo           backup on any failure, so nothing was left half-written.
  echo.
  pause
  exit /b 1
)

:end
echo.
pause
endlocal
exit /b 0
