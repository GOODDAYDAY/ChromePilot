/**
 * ChromePilot Popup
 * Toggles the side panel on the active tab and closes.
 */

const messageEl = document.getElementById('message');

async function init() {
    try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (!tab) {
            messageEl.textContent = 'No active tab found.';
            return;
        }

        // chrome:// and edge:// pages don't allow content scripts
        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('about:')) {
            messageEl.textContent = 'Cannot run on this page.';
            return;
        }

        await chrome.tabs.sendMessage(tab.id, {type: 'TOGGLE_PANEL'});
        window.close();
    } catch (error) {
        messageEl.textContent = 'Reload the page and try again.';
    }
}

init();
