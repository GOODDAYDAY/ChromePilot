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
const showElementsBtn = document.getElementById('showElementsBtn');
const copyDomBtn = document.getElementById('copyDomBtn');
const teachBtn = document.getElementById('teachBtn');
const recordingsBtn = document.getElementById('recordingsBtn');
const recordingsPanel = document.getElementById('recordingsPanel');
const recordingsList = document.getElementById('recordingsList');
const closeRecordingsBtn = document.getElementById('closeRecordingsBtn');
const openInCurrentTabEl = document.getElementById('openInCurrentTab');
const autoConfirmEl = document.getElementById('autoConfirm');
const maxStepsEl = document.getElementById('maxSteps');
const actionDelayEl = document.getElementById('actionDelay');

let statusMsgEl = null;
let running = false;
let recording = false;
let previewing = false;
let previewCardEl = null;
let currentDemonstration = null;

// --- Init ---

async function init() {
    // Load settings
    try {
        const data = await chrome.storage.sync.get(['openInCurrentTab', 'autoConfirm', 'maxSteps', 'actionDelay']);
        openInCurrentTabEl.checked = !!data.openInCurrentTab;
        autoConfirmEl.checked = !!data.autoConfirm;
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
    autoConfirmEl.addEventListener('change', async () => {
        try {
            await chrome.storage.sync.set({autoConfirm: autoConfirmEl.checked});
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
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    inputEl.addEventListener('input', autoResizeInput);
    sendBtn.addEventListener('click', handleSend);
    stopBtn.addEventListener('click', handleStop);
    clearBtn.addEventListener('click', clearHistory);

    // Show Elements toggle
    showElementsBtn.addEventListener('click', async () => {
        try {
            const response = await chrome.runtime.sendMessage({type: 'TOGGLE_DEBUG_OVERLAY'});
            showElementsBtn.classList.toggle('active', response?.active);
        } catch (e) {
            console.error('[ChromePilot] Failed to toggle debug overlay:', e);
        }
    });

    // Copy DOM to clipboard
    copyDomBtn.addEventListener('click', async () => {
        try {
            const response = await chrome.runtime.sendMessage({type: 'COPY_DOM'});
            if (response?.success) {
                await navigator.clipboard.writeText(response.domContext);
                copyDomBtn.textContent = '\u2705';
                setTimeout(() => {
                    copyDomBtn.textContent = '\uD83D\uDCCB';
                }, 1500);
            }
        } catch (e) {
            console.error('[ChromePilot] Failed to copy DOM:', e);
        }
    });

    // Teach mode toggle
    teachBtn.addEventListener('click', async () => {
        if (running) return;

        if (!recording) {
            try {
                const response = await chrome.runtime.sendMessage({type: 'START_RECORDING'});
                if (response?.success) {
                    recording = true;
                    teachBtn.classList.add('recording');
                    addMessage('status', '\uD83D\uDD34 Recording your actions... Click \uD83C\uDF93 again when done.');
                }
            } catch (e) {
                console.error('[ChromePilot] Failed to start recording:', e);
            }
        } else {
            try {
                const response = await chrome.runtime.sendMessage({type: 'STOP_RECORDING'});
                if (response?.success) {
                    recording = false;
                    teachBtn.classList.remove('recording');
                    removeStatusMessage();

                    if (response.recording && response.recording.actions.length > 0) {
                        showRecordingSummary(response.recording);
                    } else {
                        addMessage('status', 'No actions recorded.');
                    }
                }
            } catch (e) {
                console.error('[ChromePilot] Failed to stop recording:', e);
            }
        }
    });

    // Recordings panel
    recordingsBtn.addEventListener('click', async () => {
        if (recordingsPanel.classList.contains('hidden')) {
            await loadRecordingsList();
            recordingsPanel.classList.remove('hidden');
        } else {
            recordingsPanel.classList.add('hidden');
        }
    });

    closeRecordingsBtn.addEventListener('click', () => {
        recordingsPanel.classList.add('hidden');
    });

    // JSON paste detection
    inputEl.addEventListener('paste', () => {
        setTimeout(() => {
            const text = inputEl.value.trim();
            if (text.startsWith('{') && text.includes('"user_demonstration"')) {
                try {
                    const parsed = JSON.parse(text);
                    if (parsed.type === 'user_demonstration' && Array.isArray(parsed.actions)) {
                        currentDemonstration = parsed;
                        inputEl.value = '';
                        inputEl.style.height = 'auto';
                        addMessage('status',
                            `\uD83C\uDF93 Imported "${parsed.name || 'Unnamed'}" (${parsed.actions.length} actions). Type a command to use it.`
                        );
                    }
                } catch {
                    // Not valid JSON — treat as normal text
                }
            }
        }, 0);
    });

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
            case 'ACTION_PREVIEW':
                removeStatusMessage();
                showPreviewCard(message.actions, message.warnings, message.step, message.maxSteps);
                break;
            case 'RECORD_ACTION':
                showRecordActionLive(message.action);
                break;
            case 'COMMAND_RESULT':
                removeStatusMessage();
                removePreviewCard();
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
    teachBtn.disabled = isRunning;
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
    const title = document.createElement('div');
    title.className = 'welcome-title';
    title.textContent = 'ChromePilot';
    const desc = document.createElement('div');
    desc.textContent = 'Type a command to control this page. For example: "click the login button"';
    welcome.appendChild(title);
    welcome.appendChild(desc);
    messagesEl.appendChild(welcome);
}

// --- Actions ---

function autoResizeInput() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || running) return;

    addMessage('user', text);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    setRunning(true);

    try {
        const msg = {type: 'EXECUTE_COMMAND', command: text};
        if (currentDemonstration) {
            msg.demonstrationContext = currentDemonstration;
            currentDemonstration = null;
        }
        await chrome.runtime.sendMessage(msg);
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

// --- Preview Card ---

function showPreviewCard(actions, warnings, step, maxSteps) {
    removePreviewCard();
    previewing = true;
    hideWelcome();

    // Enable input field so user can type feedback for re-analysis
    inputEl.disabled = false;
    inputEl.placeholder = 'Type feedback for re-analysis, or just click Confirm...';

    const card = document.createElement('div');
    card.className = 'message ai preview-card';

    // Header
    const header = document.createElement('div');
    header.className = 'preview-header';
    header.textContent = maxSteps
        ? `Step ${step}/${maxSteps} — Planned Actions`
        : step > 1
            ? `Step ${step} — Planned Actions`
            : 'Planned Actions';
    card.appendChild(header);

    // Action list
    const list = document.createElement('div');
    list.className = 'preview-actions-list';
    actions.forEach((action, i) => {
        const item = document.createElement('div');
        item.className = 'preview-action-item';
        item.textContent = `${i + 1}. ${formatActionForDisplay(action)}`;
        list.appendChild(item);
    });
    card.appendChild(list);

    // Warnings
    if (warnings && warnings.length > 0) {
        const warningsDiv = document.createElement('div');
        warningsDiv.className = 'preview-warnings';
        for (const w of warnings) {
            const wLine = document.createElement('div');
            wLine.textContent = w;
            warningsDiv.appendChild(wLine);
        }
        card.appendChild(warningsDiv);
    }

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'preview-btn-row';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'preview-btn preview-btn-confirm';
    confirmBtn.textContent = '\u25B6 Confirm';
    confirmBtn.addEventListener('click', async () => {
        removePreviewCard();
        try {
            await chrome.runtime.sendMessage({type: 'CONFIRM_ACTIONS'});
        } catch (e) {
            console.error('[ChromePilot] Failed to confirm actions:', e);
        }
    });

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'preview-btn preview-btn-reject';
    rejectBtn.textContent = '\uD83D\uDD04 Re-analyze';
    rejectBtn.addEventListener('click', async () => {
        // Grab user feedback from input field
        const feedback = inputEl.value.trim();
        inputEl.value = '';
        inputEl.style.height = 'auto';
        if (feedback) {
            addMessage('user', feedback);
        }
        removePreviewCard();
        try {
            await chrome.runtime.sendMessage({type: 'REJECT_ACTIONS', feedback});
        } catch (e) {
            console.error('[ChromePilot] Failed to reject actions:', e);
        }
    });

    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(rejectBtn);
    card.appendChild(btnRow);

    messagesEl.appendChild(card);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    previewCardEl = card;
}

function removePreviewCard() {
    if (previewCardEl && previewCardEl.parentNode) {
        previewCardEl.remove();
        previewCardEl = null;
    }
    previewing = false;
    inputEl.placeholder = 'Type a command...';
}

// --- Teach Mode helpers ---

function formatActionForDisplay(action) {
    // Support both LLM actions (index + description) and teach mode recordings (element object)
    if (action.description) {
        return action.description;
    }
    switch (action.action) {
        case 'click': {
            if (action.index != null) return `Click element [${action.index}]`;
            const el = action.element || {};
            return `Click "${el.text || el.ariaLabel || el.id || el.tag || 'element'}"`;
        }
        case 'type': {
            const value = action.value ? `"${action.value}"` : '';
            if (action.index != null) return `Type ${value} in element [${action.index}]`;
            const el = action.element || {};
            return `Type ${value} in ${el.placeholder || el.id || el.tag || 'input'}`;
        }
        case 'scroll':
            return `Scroll ${action.direction || 'down'} ~${action.amount || 500}px`;
        case 'navigate':
            return `Navigate to ${action.url}`;
        case 'read':
            return action.index != null ? `Read element [${action.index}]` : 'Read';
        case 'repeat':
            return action.index != null
                ? `Click element [${action.index}] x${action.times || 1}`
                : `Repeat x${action.times || 1}`;
        default:
            return action.action;
    }
}

function showRecordActionLive(action) {
    const text = '\uD83D\uDD34 ' + formatActionForDisplay(action);
    addMessage('recording', text);
}

function showRecordingSummary(rec) {
    hideWelcome();
    const container = document.createElement('div');
    container.className = 'message ai recording-summary';

    const list = document.createElement('div');
    list.className = 'recording-actions-list';
    rec.actions.forEach((a, i) => {
        const line = document.createElement('div');
        line.className = 'recording-action-item';
        line.textContent = `${i + 1}. ${formatActionForDisplay(a)}`;
        list.appendChild(line);
    });
    container.appendChild(list);

    const nameRow = document.createElement('div');
    nameRow.className = 'recording-name-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'recording-name-input';
    nameInput.placeholder = 'Name this recording...';
    nameInput.value = `${document.title || 'Recording'} - ${new Date().toLocaleTimeString()}`;
    nameRow.appendChild(nameInput);
    container.appendChild(nameRow);

    const btnRow = document.createElement('div');
    btnRow.className = 'recording-btn-row';

    const saveButton = document.createElement('button');
    saveButton.className = 'recording-action-btn save';
    saveButton.textContent = 'Save & Use';
    saveButton.addEventListener('click', async () => {
        rec.name = nameInput.value.trim() || 'Unnamed';
        await chrome.runtime.sendMessage({type: 'SAVE_RECORDING', recording: rec});
        currentDemonstration = rec;
        saveButton.textContent = '\u2705 Saved';
        saveButton.disabled = true;
        addMessage('status', `\uD83C\uDF93 Demonstration "${rec.name}" ready. Type a command to use it.`);
    });
    btnRow.appendChild(saveButton);

    const copyButton = document.createElement('button');
    copyButton.className = 'recording-action-btn copy';
    copyButton.textContent = 'Copy JSON';
    copyButton.addEventListener('click', async () => {
        rec.name = nameInput.value.trim() || 'Unnamed';
        await navigator.clipboard.writeText(JSON.stringify(rec, null, 2));
        copyButton.textContent = '\u2705 Copied';
        setTimeout(() => {
            copyButton.textContent = 'Copy JSON';
        }, 1500);
    });
    btnRow.appendChild(copyButton);

    const discardButton = document.createElement('button');
    discardButton.className = 'recording-action-btn discard';
    discardButton.textContent = 'Discard';
    discardButton.addEventListener('click', () => {
        container.remove();
    });
    btnRow.appendChild(discardButton);

    container.appendChild(btnRow);
    messagesEl.appendChild(container);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadRecordingsList() {
    const response = await chrome.runtime.sendMessage({type: 'GET_RECORDINGS'});
    const recordings = response?.recordings || [];
    recordingsList.textContent = '';

    if (recordings.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'recordings-empty';
        empty.textContent = 'No saved recordings.';
        recordingsList.appendChild(empty);
        return;
    }

    recordings.forEach((rec, index) => {
        const item = document.createElement('div');
        item.className = 'recording-item';

        const info = document.createElement('div');
        info.className = 'recording-item-info';

        const name = document.createElement('div');
        name.className = 'recording-item-name';
        name.textContent = rec.name || 'Unnamed';
        info.appendChild(name);

        const meta = document.createElement('div');
        meta.className = 'recording-item-meta';
        meta.textContent = `${rec.actions.length} actions \u00B7 ${new Date(rec.createdAt).toLocaleString()}`;
        info.appendChild(meta);

        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'recording-item-actions';

        const useBtn = document.createElement('button');
        useBtn.className = 'rec-btn use';
        useBtn.textContent = 'Use';
        useBtn.title = 'Use as demonstration context';
        useBtn.addEventListener('click', () => {
            currentDemonstration = rec;
            recordingsPanel.classList.add('hidden');
            addMessage('status', `\uD83C\uDF93 Using "${rec.name}" as demonstration. Type a command.`);
        });
        actions.appendChild(useBtn);

        const cpBtn = document.createElement('button');
        cpBtn.className = 'rec-btn copy';
        cpBtn.textContent = 'Copy';
        cpBtn.addEventListener('click', async () => {
            await navigator.clipboard.writeText(JSON.stringify(rec, null, 2));
            cpBtn.textContent = '\u2705';
            setTimeout(() => {
                cpBtn.textContent = 'Copy';
            }, 1500);
        });
        actions.appendChild(cpBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'rec-btn delete';
        delBtn.textContent = '\u2717';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', async () => {
            await chrome.runtime.sendMessage({type: 'DELETE_RECORDING', index});
            await loadRecordingsList();
        });
        actions.appendChild(delBtn);

        item.appendChild(actions);
        recordingsList.appendChild(item);
    });
}

init();
