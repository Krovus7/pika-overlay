@echo off
SET NODE_DIR=%APPDATA%\nodejs-portable\bin
SET PATH=%NODE_DIR%;%PATH%
cd /d "%~dp0"
echo Compiling... This might take a few minutes.
call npm install
call npm run dist
echo.
echo Compilation completed! Check the "dist" folder.
pause
