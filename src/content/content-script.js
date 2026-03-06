/**
 * ChromePilot Content Script — Orchestrator
 * Handles messaging between service worker and content modules.
 * Loaded after: utils.js, dom-extractor.js, action-executor.js
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'PING':
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
    }
    return true;
});
