/**
 * ChromePilot shared utilities
 */

async function sendMessageToBackground(message) {
    try {
        const response = await chrome.runtime.sendMessage(message);
        return response;
    } catch (error) {
        console.error('[ChromePilot] sendMessageToBackground failed:', error);
        return {success: false, error: error.message};
    }
}

async function sendMessageToTab(tabId, message) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
    } catch (error) {
        console.error('[ChromePilot] sendMessageToTab failed:', error);
        return {success: false, error: error.message};
    }
}

async function getStorage(keys) {
    try {
        return await chrome.storage.local.get(keys);
    } catch (error) {
        console.error('[ChromePilot] getStorage failed:', error);
        return {};
    }
}

async function setStorage(data) {
    try {
        await chrome.storage.local.set(data);
        return true;
    } catch (error) {
        console.error('[ChromePilot] setStorage failed:', error);
        return false;
    }
}

async function getSyncStorage(keys) {
    try {
        return await chrome.storage.sync.get(keys);
    } catch (error) {
        console.error('[ChromePilot] getSyncStorage failed:', error);
        return {};
    }
}

async function setSyncStorage(data) {
    try {
        await chrome.storage.sync.set(data);
        return true;
    } catch (error) {
        console.error('[ChromePilot] setSyncStorage failed:', error);
        return false;
    }
}
