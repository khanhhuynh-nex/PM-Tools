@echo off
title Epicor PR Automation
echo.
echo  ====================================
echo   Epicor PR Automation Tool
echo  ====================================
echo.

:: Check if node_modules exists, if not run npm install
if not exist "node_modules" (
    echo  [SETUP] First-time setup detected. Installing dependencies...
    echo.
    call npm install
    echo.
    echo  [SETUP] Installing Playwright browser...
    call npx playwright install chromium
    echo.
    echo  [SETUP] Setup complete!
    echo.
)

echo  Starting server...
echo  The app will open in your browser automatically.
echo.

:: Start the server and open the browser after a short delay
start "" http://localhost:3000
node server.js
pause
