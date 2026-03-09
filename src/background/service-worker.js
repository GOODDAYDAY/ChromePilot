/**
 * ChromePilot Service Worker
 * Orchestrates: DOM extraction → LLM call → action execution (multi-step loop)
 */

import {callLLM} from './llm-client.js';

const DEFAULT_STORAGE = {
    llmProvider: '',
    llmBaseUrl: '',
    llmApiKey: '',
    llmModel: '',
    openInCurrentTab: false,
    maxSteps: 10,
    actionDelay: 500,
    maxElements: 150
};

const DEFAULT_MAX_STEPS = 10;
const STEP_DELAY_MS = 1000;
const NAV_WAIT_MS = 3000;

let taskCancelled = false;
let currentAbortController = null;
let recordingTabId = null;

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        try {
            await chrome.storage.sync.set(DEFAULT_STORAGE);
            console.log('[ChromePilot] Default storage initialized');
        } catch (error) {
            console.error('[ChromePilot] Failed to initialize storage:', error);
        }
    }
});

// Click extension icon → open side panel
chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.sidePanel.open({windowId: tab.windowId});
    } catch (error) {
        console.error('[ChromePilot] Failed to open side panel:', error);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXECUTE_COMMAND') {
        handleExecuteCommand(message.command, message.demonstrationContext)
            .then(sendResponse)
            .catch((error) => {
                console.error('[ChromePilot] EXECUTE_COMMAND error:', error);
                sendResponse({success: false, error: error.message});
            });
        return true;
    }

    if (message.type === 'CANCEL_TASK') {
        taskCancelled = true;
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        // Cancel running actions in content script
        getActiveTabId().then(tabId => {
            chrome.tabs.sendMessage(tabId, {type: 'CANCEL_ACTIONS'}).catch(() => {
            });
        }).catch(() => {
        });
        // Stop recording if active
        if (recordingTabId) {
            chrome.tabs.sendMessage(recordingTabId, {type: 'STOP_RECORDING'}).catch(() => {
            });
            recordingTabId = null;
        }
        sendResponse({success: true});
        return false;
    }

    if (message.type === 'COPY_DOM') {
        getActiveTabId().then(tabId => {
            ensureContentScripts(tabId).then(() => {
                chrome.tabs.sendMessage(tabId, {type: 'EXTRACT_DOM'}, (response) => {
                    sendResponse(response || {success: false});
                });
            }).catch(e => sendResponse({success: false, error: e.message}));
        }).catch(e => sendResponse({success: false, error: e.message}));
        return true;
    }

    if (message.type === 'TOGGLE_DEBUG_OVERLAY') {
        getActiveTabId().then(tabId => {
            ensureContentScripts(tabId).then(() => {
                chrome.tabs.sendMessage(tabId, {type: 'TOGGLE_DEBUG_OVERLAY'}, (response) => {
                    sendResponse(response || {success: false});
                });
            }).catch(e => sendResponse({success: false, error: e.message}));
        }).catch(e => sendResponse({success: false, error: e.message}));
        return true;
    }

    if (message.type === 'TEST_LLM') {
        handleTestLLM(message.config)
            .then(sendResponse)
            .catch((error) => {
                sendResponse({success: false, error: error.message});
            });
        return true;
    }

    // --- Recording (Teach Mode) ---

    if (message.type === 'START_RECORDING') {
        getActiveTabId().then(async (tabId) => {
            await ensureContentScripts(tabId);
            const response = await chrome.tabs.sendMessage(tabId, {type: 'START_RECORDING'});
            if (response?.success) {
                recordingTabId = tabId;
            }
            sendResponse(response || {success: false});
        }).catch(e => sendResponse({success: false, error: e.message}));
        return true;
    }

    if (message.type === 'STOP_RECORDING') {
        if (!recordingTabId) {
            sendResponse({success: false, reason: 'Not recording'});
            return false;
        }
        chrome.tabs.sendMessage(recordingTabId, {type: 'STOP_RECORDING'}, (response) => {
            recordingTabId = null;
            sendResponse(response || {success: false});
        });
        return true;
    }

    if (message.type === 'RECORD_ACTION') {
        sendToPanel({type: 'RECORD_ACTION', action: message.action});
        sendResponse({success: true});
        return false;
    }

    if (message.type === 'SAVE_RECORDING') {
        handleSaveRecording(message.recording)
            .then(sendResponse)
            .catch(e => sendResponse({success: false, error: e.message}));
        return true;
    }

    if (message.type === 'GET_RECORDINGS') {
        chrome.storage.local.get('recordings', (data) => {
            sendResponse({success: true, recordings: data.recordings || []});
        });
        return true;
    }

    if (message.type === 'DELETE_RECORDING') {
        handleDeleteRecording(message.index)
            .then(sendResponse)
            .catch(e => sendResponse({success: false, error: e.message}));
        return true;
    }
});

async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) throw new Error('No active tab found');
    return tab.id;
}

async function sendToTab(tabId, message) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        throw new Error(`Failed to communicate with page: ${error.message}`);
    }
}

async function sendToPanel(message) {
    try {
        await chrome.runtime.sendMessage(message);
    } catch (error) {
        // Panel may not be open — ignore
    }
}

async function waitForTabLoad(tabId, timeoutMs = NAV_WAIT_MS) {
    return new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        }, timeoutMs);

        function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            }
        }

        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function ensureContentScripts(tabId) {
    try {
        // Test if content script is already loaded
        await chrome.tabs.sendMessage(tabId, {type: 'PING'});
    } catch {
        // Content script not loaded — inject it
        try {
            await chrome.scripting.executeScript({
                target: {tabId},
                files: [
                    'lib/utils.js',
                    'content/dom-extractor.js',
                    'content/action-recorder.js',
                    'content/action-executor.js',
                    'content/content-script.js'
                ]
            });
            // Wait a moment for scripts to initialize
            await delay(300);
        } catch (error) {
            throw new Error(`Cannot inject scripts into this page: ${error.message}`);
        }
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleNavigateAction(action, tabId) {
    const config = await chrome.storage.sync.get('openInCurrentTab');
    const openInCurrentTab = config.openInCurrentTab;

    let url = action.url;
    // Ensure URL has protocol
    if (url && !url.match(/^https?:\/\//i)) {
        url = 'https://' + url;
    }

    let newTabId = tabId;
    if (openInCurrentTab) {
        await chrome.tabs.update(tabId, {url});
    } else {
        const newTab = await chrome.tabs.create({url});
        newTabId = newTab.id;
        // Focus the new tab
        await chrome.tabs.update(newTabId, {active: true});
    }

    // Wait for page to load
    await waitForTabLoad(newTabId);
    // Extra settle time for SPA frameworks
    await delay(500);

    return {
        tabId: newTabId,
        result: {
            action: 'navigate',
            success: true,
            message: action.description || `Navigated to ${url}`
        }
    };
}

async function handleSaveRecording(recording) {
    const data = await chrome.storage.local.get('recordings');
    const recordings = data.recordings || [];
    recordings.unshift(recording);
    if (recordings.length > 50) {
        recordings.length = 50;
    }
    await chrome.storage.local.set({recordings});
    return {success: true};
}

async function handleDeleteRecording(index) {
    const data = await chrome.storage.local.get('recordings');
    const recordings = data.recordings || [];
    if (index < 0 || index >= recordings.length) {
        return {success: false, error: 'Invalid index'};
    }
    recordings.splice(index, 1);
    await chrome.storage.local.set({recordings});
    return {success: true};
}

async function handleExecuteCommand(command, demonstrationContext = null) {
    taskCancelled = false;
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;
    let tabId = await getActiveTabId();

    const config = await chrome.storage.sync.get(['llmProvider', 'llmBaseUrl', 'llmApiKey', 'llmModel']);
    if (!config.llmProvider || !config.llmBaseUrl) {
        await sendToPanel({type: 'COMMAND_RESULT', error: 'LLM not configured. Please set up in extension options.'});
        return {success: false, error: 'LLM not configured'};
    }

    const stepsConfig = await chrome.storage.sync.get('maxSteps');
    const maxSteps = (stepsConfig.maxSteps !== undefined) ? stepsConfig.maxSteps : DEFAULT_MAX_STEPS;
    // 0 means unlimited
    const unlimited = maxSteps === 0;

    const conversationHistory = [];

    for (let step = 1; unlimited || step <= maxSteps; step++) {
        if (taskCancelled) {
            await sendToPanel({type: 'COMMAND_RESULT', error: 'Task cancelled by user.'});
            return {success: false, error: 'Cancelled'};
        }

        // Step A: Extract DOM
        await sendToPanel({
            type: 'COMMAND_STATUS',
            status: step === 1 ? 'Extracting page elements...' : `Step ${step}: Re-extracting page elements...`
        });

        await ensureContentScripts(tabId);
        const elemConfig = await chrome.storage.sync.get('maxElements');
        const maxElements = elemConfig.maxElements || 150;
        const domResponse = await sendToTab(tabId, {type: 'EXTRACT_DOM', maxElements});
        if (!domResponse?.success || !domResponse.domContext) {
            await sendToPanel({type: 'COMMAND_RESULT', error: 'Failed to extract page elements'});
            return {success: false, error: 'Failed to extract page elements'};
        }

        // Step B: Call LLM
        await sendToPanel({type: 'COMMAND_STATUS', status: step === 1 ? 'Thinking...' : `Step ${step}: Thinking...`});

        let llmResult;
        try {
            llmResult = await callLLM(config, command, domResponse.domContext, conversationHistory, signal, demonstrationContext);
        } catch (error) {
            if (error.name === 'AbortError' || taskCancelled) {
                await sendToPanel({type: 'COMMAND_RESULT', error: 'Task cancelled by user.'});
                return {success: false, error: 'Cancelled'};
            }
            await sendToPanel({type: 'COMMAND_RESULT', error: `LLM error: ${error.message}`});
            return {success: false, error: error.message};
        }

        if (llmResult.error) {
            await sendToPanel({type: 'COMMAND_RESULT', error: llmResult.error});
            return {success: false, error: llmResult.error};
        }

        if (!llmResult.actions || llmResult.actions.length === 0) {
            // No actions — task is done or LLM can't proceed
            const summary = llmResult.summary || 'Task complete (no more actions).';
            await sendToPanel({type: 'COMMAND_RESULT', summary});
            return {success: true, summary};
        }

        // Step C: Execute actions sequentially with delay
        await sendToPanel({
            type: 'COMMAND_STATUS',
            status: `Step ${step}: Executing ${llmResult.actions.length} action(s)...`
        });

        const delayConfig = await chrome.storage.sync.get('actionDelay');
        const actionDelay = (delayConfig.actionDelay !== undefined) ? delayConfig.actionDelay : 500;

        const results = [];
        for (let i = 0; i < llmResult.actions.length; i++) {
            if (taskCancelled) break;

            const action = llmResult.actions[i];

            // Delay between actions (not before the first one)
            if (i > 0) {
                await delay(actionDelay);
            }

            if (action.action === 'navigate') {
                const navResult = await handleNavigateAction(action, tabId);
                tabId = navResult.tabId;
                results.push(navResult.result);
            } else {
                // Pass actionDelay to repeat actions so they use the configured interval
                if (action.action === 'repeat' && !action.delay) {
                    action.delay = actionDelay;
                }
                const execResponse = await sendToTab(tabId, {type: 'PERFORM_ACTIONS', actions: [action]});
                if (execResponse?.success && execResponse.results) {
                    results.push(...execResponse.results);
                } else {
                    results.push({
                        action: action.action,
                        success: false,
                        message: execResponse?.error || 'Execution failed'
                    });
                }
            }
        }

        // Record this step in conversation history
        conversationHistory.push({
            actions: llmResult.actions,
            results
        });

        // Check if done
        const isDone = llmResult.done !== false; // default to true if not specified
        if (isDone) {
            currentAbortController = null;
            await sendToPanel({type: 'COMMAND_RESULT', results, summary: llmResult.summary});
            return {success: true, results};
        }

        // Not done — show step result and continue
        await sendToPanel({type: 'STEP_COMPLETE', step, maxSteps: unlimited ? null : maxSteps, results});
        await delay(STEP_DELAY_MS);
    }

    // Max steps reached (only possible when not unlimited)
    currentAbortController = null;
    await sendToPanel({type: 'COMMAND_RESULT', error: `Reached maximum of ${maxSteps} steps. Task may be incomplete.`});
    return {success: false, error: 'Max steps reached'};
}

async function handleTestLLM(config) {
    try {
        const result = await callLLM(config, 'Click the first button', '[1] <button>Test</button>', []);
        if (result.error) {
            return {success: false, error: result.error};
        }
        return {success: true, message: 'Connection successful'};
    } catch (error) {
        return {success: false, error: error.message};
    }
}
