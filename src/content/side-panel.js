/**
 * ChromePilot Side Panel
 * Chat UI injected into pages via Shadow DOM.
 * Opens by pushing page content to the left (not overlaying).
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
    background: #f9fafb;
    border-left: 1px solid #d1d5db;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    color: #1a1a1a;
    z-index: 2147483647;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
    transform: translateX(100%);
    transition: transform 0.3s ease;
}
.panel.visible {
    transform: translateX(0);
}
@media (max-width: 600px) {
    .panel {
        width: 80vw;
    }
}
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #374151;
    color: #ffffff;
    flex-shrink: 0;
}
.header-title {
    font-size: 15px;
    font-weight: 600;
}
.header-actions {
    display: flex;
    gap: 4px;
}
.header-btn {
    background: none;
    border: none;
    color: #ffffff;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
}
.header-btn:hover {
    background: rgba(255, 255, 255, 0.15);
}
.header-btn[title]:hover::after {
    content: attr(title);
}
.messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.welcome {
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
    margin-top: 40px;
    line-height: 1.6;
}
.welcome-title {
    font-size: 16px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 8px;
}
.message {
    padding: 10px 14px;
    border-radius: 8px;
    line-height: 1.5;
    word-break: break-word;
    font-size: 13px;
    max-width: 90%;
}
.message.user {
    background: #dbeafe;
    color: #1e40af;
    align-self: flex-end;
    border-bottom-right-radius: 2px;
}
.message.ai {
    background: #ffffff;
    color: #1f2937;
    align-self: flex-start;
    border-bottom-left-radius: 2px;
    border: 1px solid #e5e7eb;
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
    border: 1px solid #fecaca;
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
    background: #ffffff;
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
    background: #ffffff;
}
.chat-input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
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
let welcomeEl = null;
let panelVisible = false;

function getPanelWidth() {
    if (window.innerWidth <= 600) {
        return Math.floor(window.innerWidth * 0.8);
    }
    return PANEL_WIDTH;
}

function pushPageContent(push) {
    const width = getPanelWidth();
    document.documentElement.style.transition = 'margin-right 0.3s ease';
    document.documentElement.style.marginRight = push ? `${width}px` : '';
    document.documentElement.style.overflow = push ? 'auto' : '';
}

function showWelcome() {
    if (!messagesEl) return;
    // Remove existing welcome if any
    hideWelcome();
    welcomeEl = document.createElement('div');
    welcomeEl.className = 'welcome';
    const title = document.createElement('div');
    title.className = 'welcome-title';
    title.textContent = 'ChromePilot';
    const desc = document.createElement('div');
    desc.textContent = 'Type a command to control this page.\nFor example: "click the login button"';
    welcomeEl.appendChild(title);
    welcomeEl.appendChild(desc);
    messagesEl.appendChild(welcomeEl);
}

function hideWelcome() {
    if (welcomeEl && welcomeEl.parentNode) {
        welcomeEl.parentNode.removeChild(welcomeEl);
        welcomeEl = null;
    }
}

function createSidePanel() {
    if (panelRoot) return;

    panelRoot = document.createElement('div');
    panelRoot.id = 'chromepilot-root';
    shadowRoot = panelRoot.attachShadow({mode: 'closed'});

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadowRoot.appendChild(style);

    panelEl = document.createElement('div');
    panelEl.className = 'panel';

    // Header
    const header = document.createElement('div');
    header.className = 'header';
    const headerTitle = document.createElement('span');
    headerTitle.className = 'header-title';
    headerTitle.textContent = 'ChromePilot';

    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'header-btn';
    clearBtn.textContent = '\u{1F5D1}';
    clearBtn.title = 'Clear history';
    clearBtn.addEventListener('click', clearHistory);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'header-btn';
    closeBtn.textContent = '\u2715';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => togglePanel(false));

    headerActions.appendChild(clearBtn);
    headerActions.appendChild(closeBtn);
    header.appendChild(headerTitle);
    header.appendChild(headerActions);

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

    // Prevent Vim plugin and other extensions from capturing keystrokes
    // 1) Stop propagation so events don't escape shadow DOM
    inputEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') handleSend();
    });
    inputEl.addEventListener('keyup', (e) => e.stopPropagation());
    inputEl.addEventListener('keypress', (e) => e.stopPropagation());
    // 2) Mark host as contentEditable while input is focused so Vim plugins
    //    see document.activeElement.isContentEditable === true and back off
    inputEl.addEventListener('focus', () => {
        panelRoot.contentEditable = 'true';
    });
    inputEl.addEventListener('blur', () => {
        panelRoot.contentEditable = 'false';
    });

    sendBtnEl = document.createElement('button');
    sendBtnEl.className = 'send-btn';
    sendBtnEl.textContent = 'Send';
    sendBtnEl.addEventListener('click', handleSend);

    inputArea.appendChild(inputEl);
    inputArea.appendChild(sendBtnEl);

    panelEl.appendChild(header);
    panelEl.appendChild(messagesEl);
    panelEl.appendChild(inputArea);
    shadowRoot.appendChild(panelEl);
    document.body.appendChild(panelRoot);

    showWelcome();
}

function togglePanel(forceState) {
    createSidePanel();
    if (typeof forceState === 'boolean') {
        panelVisible = forceState;
    } else {
        panelVisible = !panelVisible;
    }
    if (panelVisible) {
        panelEl.classList.add('visible');
        pushPageContent(true);
        inputEl.focus();
    } else {
        panelEl.classList.remove('visible');
        pushPageContent(false);
    }
}

function clearHistory() {
    if (!messagesEl) return;
    messagesEl.textContent = '';
    statusMsgEl = null;
    showWelcome();
}

function addMessage(role, content) {
    createSidePanel();
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

function setStatusMessage(text) {
    createSidePanel();
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
