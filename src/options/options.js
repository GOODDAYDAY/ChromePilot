/**
 * ChromePilot Options Page
 */

const presetSelect = document.getElementById('presetSelect');
const providerSelect = document.getElementById('providerSelect');
const baseUrlInput = document.getElementById('baseUrlInput');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelInput = document.getElementById('modelInput');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const statusDiv = document.getElementById('status');

const PRESETS = {
    claude: {provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514'},
    openai: {provider: 'openai', baseUrl: 'https://api.openai.com', model: 'gpt-4o'},
    copilot: {provider: 'openai', baseUrl: 'https://models.github.ai/inference', model: 'openai/gpt-4o'},
    ollama: {provider: 'openai', baseUrl: 'http://localhost:11434', model: 'llama3'},
    custom: {provider: 'openai', baseUrl: '', model: ''}
};

presetSelect.addEventListener('change', () => {
    const preset = PRESETS[presetSelect.value];
    if (!preset) return;
    providerSelect.value = preset.provider;
    baseUrlInput.value = preset.baseUrl;
    modelInput.value = preset.model;
});

async function loadSettings() {
    try {
        const data = await chrome.storage.sync.get(['llmProvider', 'llmBaseUrl', 'llmApiKey', 'llmModel']);
        if (data.llmProvider) providerSelect.value = data.llmProvider;
        if (data.llmBaseUrl) baseUrlInput.value = data.llmBaseUrl;
        if (data.llmApiKey) apiKeyInput.value = data.llmApiKey;
        if (data.llmModel) modelInput.value = data.llmModel;

        // Try to match a preset
        for (const [key, preset] of Object.entries(PRESETS)) {
            if (preset.baseUrl === data.llmBaseUrl && preset.provider === data.llmProvider) {
                presetSelect.value = key;
                break;
            }
        }
    } catch (error) {
        console.error('[ChromePilot] Failed to load settings:', error);
    }
}

async function saveSettings() {
    const config = {
        llmProvider: providerSelect.value,
        llmBaseUrl: baseUrlInput.value.trim().replace(/\/$/, ''),
        llmApiKey: apiKeyInput.value.trim(),
        llmModel: modelInput.value.trim()
    };

    if (!config.llmBaseUrl) {
        showStatus('Please enter an API Base URL.', true);
        return;
    }
    if (!config.llmModel) {
        showStatus('Please enter a model name.', true);
        return;
    }

    try {
        await chrome.storage.sync.set(config);
        showStatus('Settings saved.', false);
    } catch (error) {
        console.error('[ChromePilot] Failed to save settings:', error);
        showStatus('Failed to save settings.', true);
    }
}

async function testConnection() {
    const config = {
        llmProvider: providerSelect.value,
        llmBaseUrl: baseUrlInput.value.trim().replace(/\/$/, ''),
        llmApiKey: apiKeyInput.value.trim(),
        llmModel: modelInput.value.trim()
    };

    if (!config.llmBaseUrl || !config.llmModel) {
        showStatus('Please fill in Base URL and Model first.', true);
        return;
    }

    testBtn.disabled = true;
    showStatus('Testing connection...', false);

    try {
        const response = await chrome.runtime.sendMessage({type: 'TEST_LLM', config});
        if (response?.success) {
            showStatus('Connection successful!', false);
        } else {
            showStatus(`Connection failed: ${response?.error || 'Unknown error'}`, true);
        }
    } catch (error) {
        showStatus(`Connection failed: ${error.message}`, true);
    } finally {
        testBtn.disabled = false;
    }
}

function showStatus(text, isError) {
    statusDiv.textContent = text;
    statusDiv.className = isError ? 'status error' : 'status success';
}

saveBtn.addEventListener('click', saveSettings);
testBtn.addEventListener('click', testConnection);
document.addEventListener('DOMContentLoaded', loadSettings);
