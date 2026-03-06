/**
 * ChromePilot Action Executor
 * Simulates real DOM actions (click, type, scroll).
 */

function showClickEffect(element) {
    const rect = element.getBoundingClientRect();

    // Overlay a fixed-position highlight box directly on top of the element
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        left: ${rect.left - 3}px;
        top: ${rect.top - 3}px;
        width: ${rect.width + 6}px;
        height: ${rect.height + 6}px;
        border: 3px solid #ef4444;
        border-radius: 4px;
        background: rgba(239, 68, 68, 0.15);
        pointer-events: none;
        z-index: 2147483646;
    `;
    document.body.appendChild(overlay);

    setTimeout(() => overlay.remove(), 800);
}

function scrollIntoViewIfNeeded(element) {
    const rect = element.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!inView) {
        element.scrollIntoView({block: 'center', behavior: 'smooth'});
    }
}

function simulateClick(element) {
    scrollIntoViewIfNeeded(element);
    showClickEffect(element);

    const opts = {bubbles: true, cancelable: true, view: window};
    element.dispatchEvent(new MouseEvent('mouseover', opts));
    element.dispatchEvent(new MouseEvent('mousedown', opts));
    element.dispatchEvent(new MouseEvent('mouseup', opts));
    element.dispatchEvent(new MouseEvent('click', opts));
}

function simulateType(element, text) {
    element.focus();
    element.value = '';
    element.value = text;
    element.dispatchEvent(new Event('input', {bubbles: true}));
    element.dispatchEvent(new Event('change', {bubbles: true}));
}

function simulateScroll(direction, amount = 500) {
    const scrollMap = {
        up: {top: -amount, left: 0},
        down: {top: amount, left: 0},
        left: {top: 0, left: -amount},
        right: {top: 0, left: amount}
    };
    const delta = scrollMap[direction] || scrollMap.down;
    window.scrollBy({...delta, behavior: 'smooth'});
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeActions(actions) {
    const results = [];

    for (const action of actions) {
        try {
            switch (action.action) {
                case 'click': {
                    const el = getElementByIndex(action.index);
                    if (!el) {
                        results.push({
                            index: action.index,
                            action: 'click',
                            success: false,
                            message: `Element [${action.index}] not found`
                        });
                        break;
                    }
                    simulateClick(el);
                    results.push({
                        index: action.index,
                        action: 'click',
                        success: true,
                        message: action.description || `Clicked element [${action.index}]`
                    });
                    break;
                }
                case 'type': {
                    const el = getElementByIndex(action.index);
                    if (!el) {
                        results.push({
                            index: action.index,
                            action: 'type',
                            success: false,
                            message: `Element [${action.index}] not found`
                        });
                        break;
                    }
                    simulateType(el, action.value || '');
                    results.push({
                        index: action.index,
                        action: 'type',
                        success: true,
                        message: action.description || `Typed "${action.value}" into element [${action.index}]`
                    });
                    break;
                }
                case 'scroll': {
                    simulateScroll(action.direction || 'down', action.amount || 500);
                    results.push({
                        action: 'scroll',
                        success: true,
                        message: action.description || `Scrolled ${action.direction || 'down'}`
                    });
                    break;
                }
                default:
                    results.push({action: action.action, success: false, message: `Unknown action: ${action.action}`});
            }
        } catch (error) {
            results.push({action: action.action, success: false, message: error.message});
        }

        if (actions.indexOf(action) < actions.length - 1) {
            await delay(300);
        }
    }

    return results;
}
