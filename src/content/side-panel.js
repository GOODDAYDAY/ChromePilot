/**
 * ChromePilot Side Panel
 * Chat UI injected into pages via Shadow DOM.
 */

const PANEL_WIDTH = 380;

const PANEL_CSS = `
:host {
    all: initial;
}
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
.panel {
    position: fixed;
    top: 0;
    right: 0;
    width: ${PANEL_WIDTH}px;
    height: 100vh;
    background: #ffffff;
    border-left: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    color: #1a1a1a;
    z-index: 2147483647;
    box-shadow: -2px 0 12px rgba(0, 0, 0, 0.1);
    transition: transform 0.25s ease;
}
.panel.hidden {
    transform: translateX(100%);
}
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #2563eb;
    color: #ffffff;
    flex-shrink: 0;
}
.header-title {
    font-size: 15px;
    font-weight: 600;
}
.close-btn {
    background: none;
    border: none;
    color: #ffffff;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
}
.close-btn:hover {
    background: rgba(255,255,255,0.2);
}
.messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.message {
    padding: 10px 12px;
    border-radius: 8px;
    line-height: 1.5;
    word-break: break-word;
    font-size: 13px;
    max-width: 90%;
}
.message.user {
    background: #eff6ff;
    color: #1e40af;
    align-self: flex-end;
    border-bottom-right-radius: 2px;
}
.message.ai {
    background: #f3f4f6;
    color: #1f2937;
    align-self: flex-start;
    border-bottom-left-radius: 2px;
}
.message.status {
    background: #fefce8;
    color: #854d0e;
    align-self: flex-start;
    font-style: italic;
    font-size: 12px;
}
.message.error {
    background: #fef2f2;
    color: #991b1b;
    align-self: flex-start;
}
.action-result {
    margin-top: 4px;
    padding: 4px 0;
    font-size: 12px;
}
.action-result.success {
    color: #166534;
}
.action-result.fail {
    color: #991b1b;
}
.input-area {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
    flex-shrink: 0;
}
.chat-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    outline: none;
    font-family: inherit;
}
.chat-input:focus {
    border-color: #2563eb;
}
.send-btn {
    padding: 8px 16px;
    background: #2563eb;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
}
.send-btn:hover {
    background: #1d4ed8;
}
.send-btn:disabled {
    background: #93c5fd;
    cursor: not-allowed;
}
`;

let panelRoot = null;
let shadowRoot = null;
let panelEl = null;
let messagesEl = null;
let inputEl = null;
let sendBtnEl = null;
let statusMsgEl = null;
let panelVisible = false;

function createSidePanel() {
    if (panelRoot) return;

    panelRoot = document.createElement('div');
    panelRoot.id = 'chromepilot-root';
    shadowRoot = panelRoot.attachShadow({mode: 'closed'});

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadowRoot.appendChild(style);

    panelEl = document.createElement('div');
    panelEl.className = 'panel hidden';

    // Header
    const header = document.createElement('div');
    header.className = 'header';
    const title = document.createElement('span');
    title.className = 'header-title';
    title.textContent = 'ChromePilot';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => togglePanel(false));
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Messages
    messagesEl = document.createElement('div');
    messagesEl.className = 'messages';

    // Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'input-area';
    inputEl = document.createElement('input');
    inputEl.className = 'chat-input';
    inputEl.type = 'text';
    inputEl.placeholder = 'Type a command...';
    inputEl.autocomplete = 'off';
    sendBtnEl = document.createElement('button');
    sendBtnEl.className = 'send-btn';
    sendBtnEl.textContent = 'Send';

    sendBtnEl.addEventListener('click', handleSend);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    inputArea.appendChild(inputEl);
    inputArea.appendChild(sendBtnEl);

    panelEl.appendChild(header);
    panelEl.appendChild(messagesEl);
    panelEl.appendChild(inputArea);
    shadowRoot.appendChild(panelEl);
    document.body.appendChild(panelRoot);
}

function togglePanel(forceState) {
    createSidePanel();
    if (typeof forceState === 'boolean') {
        panelVisible = forceState;
    } else {
        panelVisible = !panelVisible;
    }
    if (panelVisible) {
        panelEl.classList.remove('hidden');
        inputEl.focus();
    } else {
        panelEl.classList.add('hidden');
    }
}

function addMessage(role, content) {
    createSidePanel();
    const msg = document.createElement('div');
    msg.className = `message ${role}`;

    if (typeof content === 'string') {
        msg.textContent = content;
    } else if (Array.isArray(content)) {
        // Action results array
        for (const result of content) {
            const line = document.createElement('div');
            line.className = `action-result ${result.success ? 'success' : 'fail'}`;
            line.textContent = `${result.success ? '\u2713' : '\u2717'} ${result.message}`;
            msg.appendChild(line);
        }
    }

    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Clear status message reference when adding a real message
    if (role !== 'status') {
        statusMsgEl = null;
    }

    return msg;
}

function setStatusMessage(text) {
    createSidePanel();
    if (statusMsgEl) {
        statusMsgEl.textContent = text;
    } else {
        statusMsgEl = addMessage('status', text);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeStatusMessage() {
    if (statusMsgEl && statusMsgEl.parentNode) {
        statusMsgEl.parentNode.removeChild(statusMsgEl);
        statusMsgEl = null;
    }
}

function setSendEnabled(enabled) {
    if (sendBtnEl) sendBtnEl.disabled = !enabled;
    if (inputEl) inputEl.disabled = !enabled;
}

function handleSend() {
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage('user', text);
    inputEl.value = '';
    setSendEnabled(false);

    sendMessageToBackground({type: 'EXECUTE_COMMAND', command: text});
}
