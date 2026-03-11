/**
 * ChromePilot Action Previewer
 * Renders a preview overlay showing planned actions on target elements.
 * Reuses elementMap/getElementByIndex from dom-extractor.js.
 */

const PREVIEW_OVERLAY_ID = 'chromepilot-preview-overlay';
const PREVIEW_Z_INDEX = 2147483645;

let previewRafId = null;
let previewScrollHandler = null;
let previewActions = null;

/**
 * Format action label text for the preview overlay.
 */
function formatPreviewLabel(stepNum, action) {
    switch (action.action) {
        case 'click':
            return `[${stepNum}] Click`;
        case 'type':
            return `[${stepNum}] Type "${(action.value || '').substring(0, 20)}"`;
        case 'scroll':
            return `[${stepNum}] Scroll ${action.direction || 'down'}`;
        case 'read':
            return `[${stepNum}] Read`;
        case 'repeat':
            return `[${stepNum}] Repeat x${action.times || 1}`;
        default:
            return `[${stepNum}] ${action.action}`;
    }
}

/**
 * Render preview items (red borders + step-number labels) into the container.
 */
function renderPreviewItems(container, actions) {
    container.textContent = '';
    let stepNum = 0;

    for (const action of actions) {
        stepNum++;

        // Skip non-element actions (scroll, navigate) — these have no target element
        if (!action.index && action.index !== 0) continue;

        const el = getElementByIndex(action.index);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Red border box
        const box = document.createElement('div');
        box.style.cssText = `position:fixed;left:${rect.left - 3}px;top:${rect.top - 3}px;width:${rect.width + 6}px;height:${rect.height + 6}px;border:3px solid #ef4444;border-radius:4px;background:rgba(239,68,68,0.10);pointer-events:none;z-index:${PREVIEW_Z_INDEX};`;
        container.appendChild(box);

        // Step-number label at top-left
        const label = document.createElement('div');
        const labelText = formatPreviewLabel(stepNum, action);
        label.style.cssText = `position:fixed;left:${rect.left}px;top:${Math.max(0, rect.top - 20)}px;background:#ef4444;color:#fff;font-size:11px;font-weight:bold;padding:1px 6px;border-radius:3px;pointer-events:none;font-family:monospace;line-height:16px;white-space:nowrap;z-index:${PREVIEW_Z_INDEX};`;
        label.textContent = labelText;
        container.appendChild(label);
    }
}

/**
 * Show action preview overlay on the page.
 * @param {Array} actions - LLM actions array
 * @returns {{success: boolean, warnings: string[]}}
 */
function showActionPreview(actions) {
    removeActionPreview();
    previewActions = actions;

    const warnings = [];
    let hasElementAction = false;
    let firstElementScrolled = false;

    // Check each action for missing elements
    let stepNum = 0;
    for (const action of actions) {
        stepNum++;
        if (!action.index && action.index !== 0) continue;

        hasElementAction = true;
        const el = getElementByIndex(action.index);
        if (!el) {
            warnings.push(`Element [${action.index}] not found for step ${stepNum}`);
            continue;
        }

        // Scroll first target element into view
        if (!firstElementScrolled) {
            const rect = el.getBoundingClientRect();
            const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
            if (!inView) {
                el.scrollIntoView({block: 'center', behavior: 'smooth'});
            }
            firstElementScrolled = true;
        }
    }

    // If all actions are non-element (scroll, navigate), skip overlay
    if (!hasElementAction) {
        return {success: true, warnings};
    }

    // Create overlay container
    const container = document.createElement('div');
    container.id = PREVIEW_OVERLAY_ID;
    container.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;z-index:${PREVIEW_Z_INDEX};pointer-events:none;`;

    // Render after a brief delay to allow scroll to settle
    setTimeout(() => {
        renderPreviewItems(container, actions);
    }, 200);

    document.body.appendChild(container);

    // Track scroll/resize to update positions
    previewScrollHandler = () => {
        if (previewRafId) return;
        previewRafId = requestAnimationFrame(() => {
            previewRafId = null;
            const c = document.getElementById(PREVIEW_OVERLAY_ID);
            if (c && previewActions) {
                renderPreviewItems(c, previewActions);
            }
        });
    };
    window.addEventListener('scroll', previewScrollHandler, true);
    window.addEventListener('resize', previewScrollHandler);

    return {success: true, warnings};
}

/**
 * Remove the preview overlay and clean up listeners.
 */
function removeActionPreview() {
    const existing = document.getElementById(PREVIEW_OVERLAY_ID);
    if (existing) existing.remove();

    if (previewScrollHandler) {
        window.removeEventListener('scroll', previewScrollHandler, true);
        window.removeEventListener('resize', previewScrollHandler);
        previewScrollHandler = null;
    }
    if (previewRafId) {
        cancelAnimationFrame(previewRafId);
        previewRafId = null;
    }
    previewActions = null;
}

/**
 * Check if preview overlay is currently active.
 */
function isPreviewActive() {
    return !!document.getElementById(PREVIEW_OVERLAY_ID);
}
