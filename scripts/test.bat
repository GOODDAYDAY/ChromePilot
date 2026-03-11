@echo off
chcp 65001 >nul
REM Test ChromePilot extension
REM Prerequisite: Node.js installed

echo === ChromePilot Validation ===

REM Check manifest.json exists
if not exist "src\manifest.json" (
    echo FAIL: src\manifest.json not found
    exit /b 1
)
echo OK: manifest.json found

REM Check all content script files exist
for %%f in (
    src\lib\utils.js
    src\content\dom-extractor.js
    src\content\action-recorder.js
    src\content\action-executor.js
    src\content\action-previewer.js
    src\content\content-script.js
    src\background\service-worker.js
    src\background\llm-client.js
    src\sidepanel\sidepanel.js
    src\sidepanel\sidepanel.html
    src\sidepanel\sidepanel.css
    src\options\options.js
    src\options\options.html
    src\options\options.css
) do (
    if not exist "%%f" (
        echo FAIL: %%f not found
        exit /b 1
    )
)
echo OK: All source files present

echo === Running Unit Tests ===
node tests\test-req-008.js
if errorlevel 1 (
    echo FAIL: Unit tests failed
    exit /b 1
)

echo === All checks passed ===
