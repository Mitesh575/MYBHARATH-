@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher not found. Install Python 3.11 or newer, then try again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found. Install Node.js 22 or newer, then try again.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 goto fail
)
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto fail
call npm ci
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
set HOST=127.0.0.1
echo.
echo FaultLab is starting. Open http://127.0.0.1:8000 in your browser.
echo Keep this window open. Press Ctrl+C to stop the app.
echo.
call npm run dev
exit /b %errorlevel%
:fail
echo.
echo Setup failed. Check the error above and the README instructions.
pause
exit /b 1
