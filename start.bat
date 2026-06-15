@echo off
SET ELECTRON_RUN_AS_NODE=
SET NODE_DIR=%APPDATA%\nodejs-portable\bin
SET PATH=%NODE_DIR%;%PATH%
cd /d "%~dp0"
echo Starting Pika-Network BedWars Overlay...
"%~dp0node_modules\electron\dist\electron.exe" .
