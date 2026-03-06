/**
 * ChromePilot Content Script — Orchestrator
 * Handles messaging between service worker and content modules.
 * Loaded after: utils.js, dom-extractor.js, action-executor.js, side-panel.js
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'TOGGLE_PANEL':
            togglePanel();
            sendResponse({success: true});
            break;

        case 'EXTRACT_DOM': {
            const domContext = extractInteractiveElements();
            sendResponse({success: true, domContext});
            break;
        }

        case 'PERFORM_ACTIONS':
            executeActions(message.actions)
                .then(results => sendResponse({success: true, results}))
                .catch(error => sendResponse({success: false, error: error.message}));
            return true;

        case 'COMMAND_STATUS':
            setStatusMessage(message.status);
            sendResponse({success: true});
            break;

        case 'COMMAND_RESULT':
            removeStatusMessage();
            if (message.error) {
                addMessage('error', message.error);
            } else if (message.results) {
                addMessage('ai', message.results);
            }
            setSendEnabled(true);
            sendResponse({success: true});
            break;
    }
    return true;
});
