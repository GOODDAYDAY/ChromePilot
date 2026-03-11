@echo off
chcp 65001 >nul
REM Build ChromePilot extension
REM No build step needed — plain files loaded directly by Chrome
REM If Vite is added later, replace with: npm run build

echo ChromePilot is a plain JS extension. No build step required.
echo Load the /src directory directly in chrome://extensions (Developer Mode).
