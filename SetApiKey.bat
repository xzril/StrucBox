@echo off
rem Saves your AI key to .env in this folder (never uploaded to GitHub). A key unlocks Premium AI tools.
cd /d "%~dp0"
echo Which AI do you have a key for?
echo   1 = Claude (Anthropic)
echo   2 = Gemini (Google)
choice /c 12 /n /m "Press 1 or 2: "
if errorlevel 2 (set PROVIDER=gemini& set VAR=GEMINI_API_KEY) else (set PROVIDER=anthropic& set VAR=ANTHROPIC_API_KEY)
set /p KEY=Paste your %VAR% and press Enter: 
rem keep the other provider's key, replace this one
if exist .env (findstr /v /b /c:"AI_PROVIDER=" /c:"%VAR%=" .env > .env.tmp) else (type nul > .env.tmp)
>> .env.tmp echo AI_PROVIDER=%PROVIDER%
>> .env.tmp echo %VAR%=%KEY%
move /y .env.tmp .env > nul
echo Saved. Close the StrucBox window and start StrucBox.bat again.
pause
