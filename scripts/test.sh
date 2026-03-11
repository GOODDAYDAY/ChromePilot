#!/bin/bash
set -e
# Test ChromePilot extension
# Prerequisite: Node.js installed

echo "=== ChromePilot Validation ==="

# Check manifest.json exists
if [ ! -f "src/manifest.json" ]; then
    echo "FAIL: src/manifest.json not found"
    exit 1
fi
echo "OK: manifest.json found"

# Check all content script files exist
FILES=(
    "src/lib/utils.js"
    "src/content/dom-extractor.js"
    "src/content/action-recorder.js"
    "src/content/action-executor.js"
    "src/content/action-previewer.js"
    "src/content/content-script.js"
    "src/background/service-worker.js"
    "src/background/llm-client.js"
    "src/sidepanel/sidepanel.js"
    "src/sidepanel/sidepanel.html"
    "src/sidepanel/sidepanel.css"
    "src/options/options.js"
    "src/options/options.html"
    "src/options/options.css"
)

for f in "${FILES[@]}"; do
    if [ ! -f "$f" ]; then
        echo "FAIL: $f not found"
        exit 1
    fi
done
echo "OK: All source files present"

echo "=== Running Unit Tests ==="
node tests/test-req-008.js

echo "=== All checks passed ==="
