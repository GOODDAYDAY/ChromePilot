/**
 * ChromePilot Side Panel (standalone page)
 * Communicates with service worker via chrome.runtime messaging.
 */

const messagesEl = document.getElementById('messages');
const welcomeEl = document.getElementById('welcome');
const inputEl = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const openInCurrentTabEl = document.getElementById('openInCurrentTab');
const maxStepsEl = document.getElementById('maxSteps');
const actionDelayEl = document.getElementById('actionDelay');

let statusMsgEl = null;
let running = false;

// --- Init ---

async function init() {
    // Load settings
    try {
        const data = await chrome.storage.sync.get(['openInCurrentTab', 'maxSteps', 'actionDelay']);
        openInCurrentTabEl.checked = !!data.openInCurrentTab;
        if (data.maxSteps !== undefined) {
            maxStepsEl.value = String(data.maxSteps);
        }
        if (data.actionDelay !== undefined) {
            actionDelayEl.value = String(data.actionDelay);
        }
    } catch (e) {
        console.error('[ChromePilot] Failed to load settings:', e);
    }

    // Settings persistence
    openInCurrentTabEl.addEventListener('change', async () => {
        try {
            await chrome.storage.sync.set({openInCurrentTab: openInCurrentTabEl.checked});
        } catch (e) {
            console.error('[ChromePilot] Failed to save settings:', e);
        }
    });
    maxStepsEl.addEventListener('change', async () => {
        try {
            await chrome.storage.sync.set({maxSteps: parseInt(maxStepsEl.value, 10)});
        } catch (e) {
            console.error('[ChromePilot] Failed to save settings:', e);
        }
    });
    actionDelayEl.addEventListener('change', async () => {
        try {
            await chrome.storage.sync.set({actionDelay: parseInt(actionDelayEl.value, 10)});
        } catch (e) {
            console.error('[ChromePilot] Failed to save settings:', e);
        }
    });

    // Input handlers
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });
    sendBtn.addEventListener('click', handleSend);
    stopBtn.addEventListener('click', handleStop);
    clearBtn.addEventListener('click', clearHistory);

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((message) => {
        switch (message.type) {
            case 'COMMAND_STATUS':
                setStatusMessage(message.status);
                break;
            case 'STEP_COMPLETE':
                removeStatusMessage();
                showStepResult(message.step, message.maxSteps, message.results);
                break;
            case 'COMMAND_RESULT':
                removeStatusMessage();
                if (message.error) {
                    addMessage('error', message.error);
                } else if (message.results) {
                    addMessage('ai', message.results);
                } else if (message.summary) {
                    addMessage('ai', message.summary);
                }
                setRunning(false);
                break;
        }
    });
}

// --- UI helpers ---

function hideWelcome() {
    if (welcomeEl && welcomeEl.parentNode) {
        welcomeEl.remove();
    }
}

function addMessage(role, content) {
    hideWelcome();

    const msg = document.createElement('div');
    msg.className = `message ${role}`;

    if (typeof content === 'string') {
        msg.textContent = content;
    } else if (Array.isArray(content)) {
        for (const result of content) {
            const line = document.createElement('div');
            line.className = `action-result ${result.success ? 'success' : 'fail'}`;
            line.textContent = `${result.success ? '\u2713' : '\u2717'} ${result.message}`;
            msg.appendChild(line);
        }
    }

    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (role !== 'status') {
        statusMsgEl = null;
    }
    return msg;
}

function showStepResult(step, maxSteps, results) {
    hideWelcome();

    const msg = document.createElement('div');
    msg.className = 'message ai';

    if (Array.isArray(results)) {
        for (const result of results) {
            const line = document.createElement('div');
            line.className = `action-result ${result.success ? 'success' : 'fail'}`;
            line.textContent = `${result.success ? '\u2713' : '\u2717'} ${result.message}`;
            msg.appendChild(line);
        }
    }

    const indicator = document.createElement('div');
    indicator.className = 'step-indicator';
    indicator.textContent = maxSteps ? `Step ${step} / ${maxSteps}` : `Step ${step}`;
    msg.appendChild(indicator);

    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatusMessage(text) {
    hideWelcome();
    if (statusMsgEl) {
        statusMsgEl.textContent = text;
    } else {
        statusMsgEl = addMessage('status', text);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeStatusMessage() {
    if (statusMsgEl && statusMsgEl.parentNode) {
        statusMsgEl.remove();
        statusMsgEl = null;
    }
}

function setRunning(isRunning) {
    running = isRunning;
    sendBtn.disabled = isRunning;
    inputEl.disabled = isRunning;
    if (isRunning) {
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
    } else {
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
    }
}

function clearHistory() {
    messagesEl.textContent = '';
    statusMsgEl = null;
    // Re-add welcome
    const welcome = document.createElement('div');
    welcome.className = 'welcome';
    welcome.id = 'welcome';
    welcome.innerHTML = '<div class="welcome-title">ChromePilot</div><div>Type a command to control this page.<br>For example: "click the login button"</div>';
    messagesEl.appendChild(welcome);
}

// --- Actions ---

async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || running) return;

    addMessage('user', text);
    inputEl.value = '';
    setRunning(true);

    try {
        await chrome.runtime.sendMessage({type: 'EXECUTE_COMMAND', command: text});
    } catch (error) {
        addMessage('error', `Failed to send command: ${error.message}`);
        setRunning(false);
    }
}

async function handleStop() {
    try {
        await chrome.runtime.sendMessage({type: 'CANCEL_TASK'});
    } catch (error) {
        console.error('[ChromePilot] Failed to cancel task:', error);
    }
}

init();
