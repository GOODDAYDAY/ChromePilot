#!/bin/bash
set -e
# Run/load ChromePilot extension
# Opens Chrome with the extensions page

echo "Opening Chrome extensions page..."
if command -v google-chrome &>/dev/null; then
    google-chrome chrome://extensions &
elif command -v chromium &>/dev/null; then
    chromium chrome://extensions &
else
    echo "Chrome not found. Please open chrome://extensions manually."
fi
echo "Load unpacked extension from the /src directory."
