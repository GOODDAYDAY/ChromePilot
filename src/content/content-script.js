/**
 * ChromePilot Content Script
 * Injected into web pages, listens for action commands from the service worker.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PERFORM_ACTION') {
        const result = executeAction(message.action);
        sendResponse(result);
    }
    return true;
});

function executeAction(action) {
    switch (action.type) {
        case 'click':
            console.log('[ChromePilot] Would click:', action.value);
            return {success: true, message: `Action logged: click "${action.value}"`};

        case 'type':
            console.log('[ChromePilot] Would type:', action.value);
            return {success: true, message: `Action logged: type "${action.value}"`};

        case 'scroll':
            console.log('[ChromePilot] Would scroll:', action.value);
            return {success: true, message: `Action logged: scroll "${action.value}"`};

        case 'log':
        default:
            console.log('[ChromePilot] Received command:', action.value);
            return {success: true, message: `Command received: "${action.value}"`};
    }
}
