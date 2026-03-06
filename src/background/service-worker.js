/**
 * ChromePilot Service Worker
 * Event-driven, stateless — all persistent data goes to chrome.storage
 */

const DEFAULT_STORAGE = {
    apiKey: '',
    commandHistory: []
};

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        try {
            await chrome.storage.local.set(DEFAULT_STORAGE);
            console.log('[ChromePilot] Default storage initialized');
        } catch (error) {
            console.error('[ChromePilot] Failed to initialize storage:', error);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXECUTE_COMMAND') {
        handleExecuteCommand(message.command)
            .then(sendResponse)
            .catch((error) => {
                console.error('[ChromePilot] EXECUTE_COMMAND error:', error);
                sendResponse({success: false, error: error.message});
            });
        return true;
    }
});

async function handleExecuteCommand(command) {
    const action = parseLLMCommand(command);

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) {
        return {success: false, error: 'No active tab found'};
    }

    try {
        const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'PERFORM_ACTION',
            action
        });
        return response;
    } catch (error) {
        return {
            success: false,
            error: `Failed to communicate with page: ${error.message}`
        };
    }
}

/**
 * Stub for future LLM integration.
 * Currently returns the raw command as a log action.
 */
function parseLLMCommand(command) {
    return {type: 'log', value: command};
}
