@echo off
chcp 65001 >nul
REM Run/load ChromePilot extension
REM Opens Chrome with the extensions page

echo Opening Chrome extensions page...
start chrome chrome://extensions
echo Load unpacked extension from the /src directory.
