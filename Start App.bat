@echo off
title PM Automation Hub
echo.
echo  ============================================
echo    PM Automation Hub
echo  ============================================
echo.

:: Auto-install dependencies on first run
if not exist "node_modules" (
    echo  [SETUP] First run detected. Installing dependencies...
    echo.
    call npm install
    echo.
    echo  [SETUP] Installing Playwright browser ^(Chromium^)...
    call npx playwright install chromium
    echo.
    echo  [SETUP] Done! Starting app...
    echo.
)

:: Warn if Celoxis .env is missing (non-blocking)
if not exist "tools\celoxis\.env" (
    echo  [WARN] tools\celoxis\.env not found.
    echo         Celoxis tool will show a setup error until you create it.
    echo.
    echo         To fix: create the file tools\celoxis\.env with this content:
    echo           CEL_EMAIL=your@email.com
    echo           CEL_PASS=yourpassword
    echo.
)

echo  Starting server on http://localhost:3000
echo  Opening browser in 2 seconds...
echo.
echo  Press Ctrl+C to stop the server.
echo.

:: Open browser after a short delay, then start server
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
node server.js

pause
