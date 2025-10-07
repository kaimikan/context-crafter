@echo off
title Context Crafter Launcher

:: ##################################################################
:: ##  1. DEFINE YOUR PROJECT PATH HERE                            ##
:: ##                                                              ##
:: ##  Replace the placeholder path below with the full path to    ##
:: ##  your 'context-crafter' project folder.                      ##
:: ##                                                              ##
:: ##  Example:                                                    ##
:: ##  set "PROJECT_PATH=C:\Users\YourName\Documents\context-crafter"  ##
:: ##################################################################
set "PROJECT_PATH=C:\path\to\your\project\folder"


:: --- Do not edit below this line ---

echo ========================================
echo  Context Crafter Launcher
echo ========================================
echo Project folder set to: "%PROJECT_PATH%"
echo.

:: Change to the project directory. The /d switch handles changing drives if needed.
cd /d "%PROJECT_PATH%"

:: Check if the project exists at the specified path
if not exist "package.json" (
    echo ERROR: Could not find 'package.json' in the specified folder.
    echo Please make sure the PROJECT_PATH variable in this script is correct.
    echo.
    pause
    exit
)

echo [1/2] Ensuring all dependencies are installed...
call npm install

echo.
echo [2/2] Launching the application in Chrome...
echo The server is starting. Your browser will open shortly.
echo.
call npm run start-chrome

echo Server has been started. You can close this command window to stop the server.
echo.
pause