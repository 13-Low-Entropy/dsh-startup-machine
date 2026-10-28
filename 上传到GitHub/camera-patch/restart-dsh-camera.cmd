@echo off
rem Fully quit DeepSeek Harness (all processes), then relaunch.
rem Required once after installing the camera permission patch: the Electron main
rem process reads app.asar only at startup, so a running instance keeps the old
rem permission handler until it is completely restarted.
echo.
echo   Stopping all DeepSeek Harness processes...
taskkill /IM "DeepSeek Harness.exe" /F >nul 2>&1
timeout /t 3 /nobreak >nul
set "EXE="
for /d %%D in ("D:\deepseek\*") do if exist "%%D\resources\app.asar" if exist "%%D\DeepSeek Harness.exe" set "EXE=%%D\DeepSeek Harness.exe"
if not defined EXE for /d %%D in ("C:\Program Files\*") do if exist "%%D\resources\app.asar" if exist "%%D\DeepSeek Harness.exe" set "EXE=%%D\DeepSeek Harness.exe"
if not defined EXE for /d %%D in ("C:\Program Files (x86)\*") do if exist "%%D\resources\app.asar" if exist "%%D\DeepSeek Harness.exe" set "EXE=%%D\DeepSeek Harness.exe"
rem Per-user installs (Electron default): %LOCALAPPDATA%\Programs\<app>
if not defined EXE if defined LOCALAPPDATA for /d %%D in ("%LOCALAPPDATA%\Programs\*") do if exist "%%D\resources\app.asar" if exist "%%D\DeepSeek Harness.exe" set "EXE=%%D\DeepSeek Harness.exe"
if not defined EXE goto notfound
echo   Starting: %EXE%
start "" "%EXE%"
echo   Done. The startup animation should now request the camera.
timeout /t 2 /nobreak >nul
exit /b 0
:notfound
echo   [ERROR] DeepSeek Harness.exe not found. Please start it manually.
pause
exit /b 1
