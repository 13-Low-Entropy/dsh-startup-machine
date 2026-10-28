@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"

rem Version comes from plugin\package.json and nowhere else - never hardcode it here.
rem (This banner used to say 1.4.0 while the package was actually 1.2.3.)
set "MSVER=unknown"
if exist "plugin\package.json" for /f "tokens=2 delims=:" %%V in ('findstr /c:"\"version\":" "plugin\package.json"') do set "MSVER=%%V"
if defined MSVER set "MSVER=%MSVER:"=%"
if defined MSVER set "MSVER=%MSVER:,=%"
if defined MSVER set "MSVER=%MSVER: =%"
if "%MSVER%"=="" set "MSVER=unknown"

echo.
echo   dsh-startup-machine %MSVER% installer
echo.

rem Use the absolute path: powershell.exe is not always on PATH (locked-down PATH, or a
rem non-interactive shell), and a missing powershell must not look like a broken package.
set "MSPS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%MSPS%" set "MSPS=powershell"
"%MSPS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
popd
