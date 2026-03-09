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
            const domContext = extractInteractiveElements(message.maxElements);
            sendResponse({success: true, domContext});
            break;
        }

        case 'PERFORM_ACTIONS':
            executeActions(message.actions)
                .then(results => sendResponse({success: true, results}))
                .catch(error => sendResponse({success: false, error: error.message}));
            return true;

        case 'TOGGLE_DEBUG_OVERLAY':
            if (isDebugOverlayActive()) {
                removeDebugOverlay();
                sendResponse({success: true, active: false});
            } else {
                showDebugOverlay();
                sendResponse({success: true, active: true});
            }
            break;

        case 'CANCEL_ACTIONS':
            cancelActions();
            removeDebugOverlay();
            sendResponse({success: true});
            break;

        case 'START_RECORDING':
            sendResponse(startRecording());
            break;

        case 'STOP_RECORDING':
            sendResponse(stopRecording());
            break;

        case 'IS_RECORDING':
            sendResponse({success: true, recording: isCurrentlyRecording()});
            break;
    }
    return true;
});
