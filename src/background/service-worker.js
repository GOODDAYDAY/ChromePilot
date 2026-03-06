/**
 * ChromePilot Service Worker
 * Orchestrates: DOM extraction → LLM call → action execution
 */

import {callLLM} from './llm-client.js';

const DEFAULT_STORAGE = {
    llmProvider: '',
    llmBaseUrl: '',
    llmApiKey: '',
    llmModel: '',
    commandHistory: []
};

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXECUTE_COMMAND') {
        handleExecuteCommand(message.command, sender.tab?.id)
            .then(sendResponse)
            .catch((error) => {
                console.error('[ChromePilot] EXECUTE_COMMAND error:', error);
                sendResponse({success: false, error: error.message});
            });
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
});

async function getActiveTabId(senderTabId) {
    if (senderTabId) return senderTabId;
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

async function handleExecuteCommand(command, senderTabId) {
    const tabId = await getActiveTabId(senderTabId);

    // Step 1: Extract DOM
    await sendToTab(tabId, {type: 'COMMAND_STATUS', status: 'Extracting page elements...'});
    const domResponse = await sendToTab(tabId, {type: 'EXTRACT_DOM'});
    if (!domResponse?.success || !domResponse.domContext) {
        await sendToTab(tabId, {type: 'COMMAND_RESULT', error: 'Failed to extract page elements'});
        return {success: false, error: 'Failed to extract page elements'};
    }

    // Step 2: Read LLM config
    const config = await chrome.storage.sync.get(['llmProvider', 'llmBaseUrl', 'llmApiKey', 'llmModel']);
    if (!config.llmProvider || !config.llmBaseUrl) {
        await sendToTab(tabId, {
            type: 'COMMAND_RESULT',
            error: 'LLM not configured. Please set up in extension options.'
        });
        return {success: false, error: 'LLM not configured'};
    }

    // Step 3: Call LLM
    await sendToTab(tabId, {type: 'COMMAND_STATUS', status: 'Thinking...'});
    let llmResult;
    try {
        llmResult = await callLLM(config, command, domResponse.domContext);
    } catch (error) {
        await sendToTab(tabId, {type: 'COMMAND_RESULT', error: `LLM error: ${error.message}`});
        return {success: false, error: error.message};
    }

    if (llmResult.error) {
        await sendToTab(tabId, {type: 'COMMAND_RESULT', error: llmResult.error});
        return {success: false, error: llmResult.error};
    }

    if (!llmResult.actions || llmResult.actions.length === 0) {
        await sendToTab(tabId, {type: 'COMMAND_RESULT', error: 'No actions returned by LLM'});
        return {success: false, error: 'No actions returned'};
    }

    // Step 4: Execute actions
    await sendToTab(tabId, {type: 'COMMAND_STATUS', status: `Executing ${llmResult.actions.length} action(s)...`});
    const execResponse = await sendToTab(tabId, {type: 'PERFORM_ACTIONS', actions: llmResult.actions});

    if (!execResponse?.success) {
        await sendToTab(tabId, {type: 'COMMAND_RESULT', error: execResponse?.error || 'Failed to execute actions'});
        return {success: false, error: 'Failed to execute actions'};
    }

    // Step 5: Send results
    await sendToTab(tabId, {type: 'COMMAND_RESULT', results: execResponse.results});
    return {success: true, results: execResponse.results};
}

async function handleTestLLM(config) {
    try {
        const result = await callLLM(config, 'Click the first button', '[1] <button>Test</button>');
        if (result.error) {
            return {success: false, error: result.error};
        }
        return {success: true, message: 'Connection successful'};
    } catch (error) {
        return {success: false, error: error.message};
    }
}
