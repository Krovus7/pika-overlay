@echo off
REM Reset ELECTRON_RUN_AS_NODE — historical root cause of startup crashes (see HANDOVER v2.1).
SET ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
echo Starting Pika-Network BedWars Overlay v4...
"%~dp0node_modules\electron\dist\electron.exe" .
