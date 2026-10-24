@echo off
rem Saves your Anthropic API key to .env in this folder (never uploaded to GitHub).
cd /d "%~dp0"
set /p KEY=Paste your Anthropic API key and press Enter: 
> .env echo ANTHROPIC_API_KEY=%KEY%
echo Saved. Close the StrucBox window and start StrucBox.bat again.
pause
