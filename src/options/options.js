/**
 * ChromePilot Options Page
 */

const apiKeyInput = document.getElementById('apiKeyInput');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');

async function loadSettings() {
    try {
        const data = await chrome.storage.sync.get(['apiKey']);
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
        }
    } catch (error) {
        console.error('[ChromePilot] Failed to load settings:', error);
    }
}

async function saveSettings() {
    const apiKey = apiKeyInput.value.trim();

    try {
        await chrome.storage.sync.set({apiKey});
        showStatus('Settings saved.', false);
    } catch (error) {
        console.error('[ChromePilot] Failed to save settings:', error);
        showStatus('Failed to save settings.', true);
    }
}

function showStatus(text, isError) {
    statusDiv.textContent = text;
    statusDiv.className = isError ? 'status error' : 'status success';

    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'status';
    }, 3000);
}

saveBtn.addEventListener('click', saveSettings);
document.addEventListener('DOMContentLoaded', loadSettings);
