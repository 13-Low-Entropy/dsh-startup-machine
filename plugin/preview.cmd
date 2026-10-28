@echo off
rem ============================================================
rem  dsh-startup-machine - preview launcher
rem  Serves this folder on 127.0.0.1:8917 (secure context for
rem  getUserMedia) and opens the standalone preview page.
rem ============================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] python not found in PATH.
  echo         Install Python 3, or run any static server yourself:
  echo         npx serve .
  echo.
  pause
  exit /b 1
)

echo.
echo   dsh-startup-machine preview
echo   http://127.0.0.1:8917/preview/
echo   Close this window to stop the server.
echo.

start "dsh-startup-machine preview server" /min cmd /c "python -m http.server 8917 --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8917/preview/index.html"
timeout /t 3 /nobreak >nul
endlocal
