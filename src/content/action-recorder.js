/**
 * ChromePilot Action Recorder
 * Records user actions (click, type, scroll, navigate) for teach mode.
 * Loaded after dom-extractor.js — can call getElementContext() and getElementText().
 */

let isRecording = false;
let recordedActions = [];
let recordingStartTime = 0;
let recordingIndicatorEl = null;

let clickHandler = null;
let inputHandler = null;
let scrollHandler = null;
let scrollTimer = null;
let popstateHandler = null;
let hashchangeHandler = null;

function isChromePilotElement(el) {
    return !!el.closest('#chromepilot-root, #chromepilot-debug-overlay, #chromepilot-recording-bar');
}

function captureElementInfo(el) {
    const tag = el.tagName.toLowerCase();
    return {
        tag,
        text: getElementText(el),
        id: el.id || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        role: el.getAttribute('role') || '',
        placeholder: el.placeholder || '',
        context: getElementContext(el)
    };
}

function emitRecordAction(actionData) {
    chrome.runtime.sendMessage({
        type: 'RECORD_ACTION',
        action: actionData
    }).catch(() => {
    });
}

function showCaptureFlash(el) {
    const rect = el.getBoundingClientRect();
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        left: ${rect.left - 2}px;
        top: ${rect.top - 2}px;
        width: ${rect.width + 4}px;
        height: ${rect.height + 4}px;
        border: 3px solid #22c55e;
        border-radius: 4px;
        background: rgba(34, 197, 94, 0.15);
        pointer-events: none;
        z-index: 2147483646;
        transition: opacity 0.3s ease;
    `;
    document.body.appendChild(flash);
    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 300);
    }, 300);
}

function showRecordingIndicator() {
    removeRecordingIndicator();
    const bar = document.createElement('div');
    bar.id = 'chromepilot-recording-bar';
    bar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 32px;
        background: #dc2626;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 500;
        z-index: 2147483647;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    bar.textContent = '\uD83D\uDD34 ChromePilot is recording your actions';
    document.body.appendChild(bar);
    recordingIndicatorEl = bar;
}

function removeRecordingIndicator() {
    const existing = document.getElementById('chromepilot-recording-bar');
    if (existing) existing.remove();
    recordingIndicatorEl = null;
}

function startRecording() {
    if (isRecording) return {success: false, reason: 'Already recording'};

    isRecording = true;
    recordedActions = [];
    recordingStartTime = Date.now();

    showRecordingIndicator();

    // Click — capture phase to beat framework stopPropagation
    clickHandler = (e) => {
        if (!isRecording) return;
        const el = e.target;
        if (isChromePilotElement(el)) return;

        const actionData = {
            action: 'click',
            timestamp: Date.now() - recordingStartTime,
            element: captureElementInfo(el)
        };
        recordedActions.push(actionData);
        showCaptureFlash(el);
        emitRecordAction(actionData);
    };
    document.addEventListener('click', clickHandler, true);

    // Input — use change event (fires once on commit, not per keystroke)
    inputHandler = (e) => {
        if (!isRecording) return;
        const el = e.target;
        if (isChromePilotElement(el)) return;
        const tag = el.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !el.isContentEditable) return;

        const actionData = {
            action: 'type',
            timestamp: Date.now() - recordingStartTime,
            value: el.value || el.textContent || '',
            element: captureElementInfo(el)
        };
        recordedActions.push(actionData);
        showCaptureFlash(el);
        emitRecordAction(actionData);
    };
    document.addEventListener('change', inputHandler, true);

    // Scroll — 500ms throttle, ignore <50px
    let lastScrollY = window.scrollY;
    scrollHandler = () => {
        if (!isRecording) return;
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const currentY = window.scrollY;
            const delta = currentY - lastScrollY;
            if (Math.abs(delta) < 50) return;
            const actionData = {
                action: 'scroll',
                timestamp: Date.now() - recordingStartTime,
                direction: delta > 0 ? 'down' : 'up',
                amount: Math.abs(Math.round(delta))
            };
            recordedActions.push(actionData);
            emitRecordAction(actionData);
            lastScrollY = currentY;
        }, 500);
    };
    window.addEventListener('scroll', scrollHandler, true);

    // Navigation — popstate + hashchange
    popstateHandler = () => {
        if (!isRecording) return;
        const actionData = {
            action: 'navigate',
            timestamp: Date.now() - recordingStartTime,
            url: location.href
        };
        recordedActions.push(actionData);
        emitRecordAction(actionData);
    };
    window.addEventListener('popstate', popstateHandler);

    hashchangeHandler = () => {
        if (!isRecording) return;
        const actionData = {
            action: 'navigate',
            timestamp: Date.now() - recordingStartTime,
            url: location.href
        };
        recordedActions.push(actionData);
        emitRecordAction(actionData);
    };
    window.addEventListener('hashchange', hashchangeHandler);

    return {success: true};
}

function stopRecording() {
    if (!isRecording) return {success: false, reason: 'Not recording'};

    isRecording = false;
    removeRecordingIndicator();

    if (clickHandler) {
        document.removeEventListener('click', clickHandler, true);
        clickHandler = null;
    }
    if (inputHandler) {
        document.removeEventListener('change', inputHandler, true);
        inputHandler = null;
    }
    if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler, true);
        scrollHandler = null;
    }
    if (scrollTimer) {
        clearTimeout(scrollTimer);
        scrollTimer = null;
    }
    if (popstateHandler) {
        window.removeEventListener('popstate', popstateHandler);
        popstateHandler = null;
    }
    if (hashchangeHandler) {
        window.removeEventListener('hashchange', hashchangeHandler);
        hashchangeHandler = null;
    }

    const recording = {
        type: 'user_demonstration',
        name: '',
        url: location.href,
        createdAt: new Date().toISOString(),
        actions: recordedActions
    };

    recordedActions = [];
    return {success: true, recording};
}

function isCurrentlyRecording() {
    return isRecording;
}
