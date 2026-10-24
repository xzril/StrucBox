@echo off
rem Double-click to start StrucBox. Runs from this folder, installs once, then opens the app.
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run dev
pause
