@echo off
setlocal

cd /d "%~dp0"

:: Read version from manifest.json
for /f "tokens=2 delims=:," %%a in ('findstr /c:"\"version\"" src\manifest.json') do (
    set "RAW=%%a"
)
set "VERSION=%RAW: =%"
set "VERSION=%VERSION:"=%"

set "OUTPUT=chromepilot-v%VERSION%.zip"

:: Remove old build if exists
if exist "%OUTPUT%" del "%OUTPUT%"

:: Create zip using PowerShell (built-in on Windows)
echo Packing src/ into %OUTPUT% ...
powershell -NoProfile -Command "Compress-Archive -Path 'src\*' -DestinationPath '%OUTPUT%' -Force"

if exist "%OUTPUT%" (
    echo Done: %OUTPUT%
) else (
    echo ERROR: Failed to create zip.
    exit /b 1
)

endlocal
