/**
 * ChromePilot DOM Extractor
 * Scans the page for interactive elements and builds an indexed list.
 * Captures broad set of elements including framework-rendered clickable divs/spans.
 */

const INTERACTIVE_SELECTORS = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="option"]',
    '[role="treeitem"]',
    '[onclick]',
    '[tabindex="0"]',
    '[data-action]',
    '[contenteditable="true"]'
].join(', ');

const DEFAULT_MAX_ELEMENTS = 150;
const MAX_TEXT_LENGTH = 60;
const MAX_CLASS_LENGTH = 0; // skip class to save tokens

// Selectors for detecting active dialog/modal containers
const DIALOG_SELECTORS = [
    'dialog[open]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[aria-modal="true"]'
].join(', ');

// Stores references to extracted elements for later action execution
const elementMap = new Map();

function isElementVisible(el) {
    // Fixed/sticky elements don't have offsetParent
    if (el.offsetParent === null) {
        const pos = getComputedStyle(el).position;
        if (pos !== 'fixed' && pos !== 'sticky') {
            return false;
        }
    }
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function hasClickListener(el) {
    const style = getComputedStyle(el);
    if (style.cursor === 'pointer') return true;
    return false;
}

function isNoiseElement(el) {
    const tag = el.tagName.toLowerCase();
    // SVG elements are almost always icons — skip
    if (tag === 'svg') return true;
    // For div/span: skip if no text, no aria-label, no id, no role
    if (tag === 'div' || tag === 'span') {
        const hasText = el.textContent?.trim().length > 0;
        const hasLabel = el.getAttribute('aria-label');
        const hasId = el.id;
        const hasRole = el.getAttribute('role');
        if (!hasText && !hasLabel && !hasId && !hasRole) return true;
    }
    return false;
}

function hasInteractiveAncestor(el, interactiveSet) {
    let parent = el.parentElement;
    while (parent) {
        if (interactiveSet.has(parent)) return true;
        parent = parent.parentElement;
    }
    return false;
}

function getElementText(el) {
    // Get direct text content (not deeply nested children text)
    let text = '';
    for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
        }
    }
    text = text.trim().replace(/\s+/g, ' ');

    // If no direct text, use textContent but truncated
    if (!text) {
        text = el.textContent?.trim().replace(/\s+/g, ' ') || '';
    }
    return text.substring(0, MAX_TEXT_LENGTH);
}

function getElementContext(el) {
    // Walk up the DOM to find section/heading context
    let node = el.parentElement;
    let depth = 0;
    while (node && depth < 8) {
        // Check for heading siblings or section labels
        const heading = node.querySelector('h1, h2, h3, h4, h5, h6, [class*="header"], [class*="title"], [class*="heading"]');
        if (heading && heading !== el) {
            const headingText = heading.textContent?.trim().replace(/\s+/g, ' ').substring(0, 40);
            if (headingText) return headingText;
        }
        // Check for aria-label or data-section on parent
        const label = node.getAttribute('aria-label') || node.getAttribute('data-section');
        if (label) return label.substring(0, 40);
        node = node.parentElement;
        depth++;
    }
    return '';
}

function formatElement(el, index, sectionContext) {
    const tag = el.tagName.toLowerCase();
    const attrs = [];

    if (el.id) attrs.push(`id="${el.id}"`);
    if (el.type && (tag === 'input' || tag === 'button')) attrs.push(`type="${el.type}"`);
    if (el.placeholder) attrs.push(`placeholder="${el.placeholder}"`);
    if (el.href) attrs.push(`href="${el.getAttribute('href')}"`);
    if (MAX_CLASS_LENGTH > 0 && el.className && typeof el.className === 'string') {
        const cls = el.className.trim().substring(0, MAX_CLASS_LENGTH);
        if (cls) attrs.push(`class="${cls}"`);
    }
    if (el.getAttribute('aria-label')) {
        attrs.push(`aria-label="${el.getAttribute('aria-label')}"`);
    }
    if (el.getAttribute('role')) {
        attrs.push(`role="${el.getAttribute('role')}"`);
    }
    if (el.name) attrs.push(`name="${el.name}"`);
    if (el.checked !== undefined) attrs.push(el.checked ? 'checked' : 'unchecked');
    if (el.disabled) attrs.push('disabled');
    if (el.value && tag === 'input' && el.type !== 'password') {
        attrs.push(`value="${el.value.substring(0, 30)}"`);
    }

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    const text = getElementText(el);

    let line;
    if (['input', 'img', 'br', 'hr'].includes(tag)) {
        line = `[${index}] <${tag}${attrStr}>`;
    } else {
        line = `[${index}] <${tag}${attrStr}>${text}</${tag}>`;
    }

    if (sectionContext) {
        line += ` (in: ${sectionContext})`;
    }
    return line;
}

/**
 * Detect active dialog/modal containers on the page.
 * Checks native <dialog>, ARIA roles, and common CSS patterns (fixed/absolute + high z-index).
 */
function findActiveDialogs() {
    const dialogs = [];

    // Native and ARIA dialogs
    for (const el of document.querySelectorAll(DIALOG_SELECTORS)) {
        if (isElementVisible(el)) dialogs.push(el);
    }

    // Heuristic: fixed/absolute overlays with high z-index that look like modals
    // Only if we haven't found any ARIA/native dialogs already
    if (dialogs.length === 0) {
        const candidates = document.querySelectorAll('div, section, aside');
        for (const el of candidates) {
            const style = getComputedStyle(el);
            const pos = style.position;
            if (pos !== 'fixed' && pos !== 'absolute') continue;
            const z = parseInt(style.zIndex, 10);
            if (isNaN(z) || z < 100) continue;
            const rect = el.getBoundingClientRect();
            // Must be reasonably sized (not a tiny tooltip) but not the full page backdrop
            if (rect.width < 100 || rect.height < 80) continue;
            if (rect.width >= window.innerWidth && rect.height >= window.innerHeight) continue;
            // Must contain interactive elements to be considered a dialog
            if (!el.querySelector(INTERACTIVE_SELECTORS)) continue;
            dialogs.push(el);
        }
    }

    return dialogs;
}

/**
 * Relaxed element collection for dialog containers.
 * Dialogs are small, so we scan ALL child elements and include any that are
 * visible and have meaningful content (text, aria-label, or input-like).
 * This catches framework buttons that lack role/tabindex/onclick attributes.
 */
function collectDialogElements(dialogs) {
    const elements = new Set();
    // Tags worth inspecting — skip svg, script, style, br, hr, etc.
    const CANDIDATE_TAGS = new Set([
        'button', 'a', 'input', 'textarea', 'select', 'img',
        'span', 'div', 'li', 'label', 'td', 'th', 'p',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ]);
    const NATIVE_INTERACTIVE = new Set(['button', 'a', 'input', 'textarea', 'select']);
    // Tags that are purely structural / decorative noise
    const SKIP_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'use', 'defs', 'clippath', 'mask', 'style', 'script', 'noscript', 'br', 'hr', 'wbr']);

    for (const dialog of dialogs) {
        const all = dialog.querySelectorAll('*');
        for (const el of all) {
            const tag = el.tagName.toLowerCase();
            if (SKIP_TAGS.has(tag)) continue;
            if (!CANDIDATE_TAGS.has(tag)) continue;
            if (el.closest('#chromepilot-root')) continue;
            if (!isElementVisible(el)) continue;

            // Native interactive elements — always include
            if (NATIVE_INTERACTIVE.has(tag)) {
                elements.add(el);
                continue;
            }

            // For other elements: must have direct text or meaningful attribute
            const ariaLabel = el.getAttribute('aria-label');
            const role = el.getAttribute('role');
            let directText = '';
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    directText += node.textContent;
                }
            }
            directText = directText.trim();

            // Filter: no text, no label, no role → skip (pure layout wrapper)
            if (!directText && !ariaLabel && !role) continue;

            // Filter: text is only whitespace/punctuation (decorators like "—", "|", "·")
            if (directText && !ariaLabel && !role) {
                const cleaned = directText.replace(/[\s\-—|·•\/\\:;,.'"""''()[\]{}<>!?@#$%^&*_+=~`]+/g, '');
                if (cleaned.length === 0) continue;
            }

            // Prefer leaf nodes: skip if a child element carries the same text
            const hasChildCapture = Array.from(el.children).some(child => {
                const childTag = child.tagName.toLowerCase();
                if (NATIVE_INTERACTIVE.has(childTag)) return true;
                if (!CANDIDATE_TAGS.has(childTag)) return false;
                const childText = child.textContent?.trim();
                return childText && childText === el.textContent?.trim();
            });
            if (hasChildCapture) continue;

            elements.add(el);
        }
    }
    return elements;
}

function collectCandidateElements() {
    // Phase 1: standard interactive selectors
    const selectorElements = new Set(document.querySelectorAll(INTERACTIVE_SELECTORS));

    // Phase 2: find cursor:pointer elements (framework-rendered clickable divs/spans)
    const allElements = document.querySelectorAll('div, span, li, label, img, td');
    for (const el of allElements) {
        if (selectorElements.size > 2000) break;
        if (hasClickListener(el)) {
            const hasInteractiveChild = el.querySelector(INTERACTIVE_SELECTORS);
            if (!hasInteractiveChild) {
                selectorElements.add(el);
            }
        }
    }

    // Phase 3: filter out noise and deduplicate parent/child
    const primarySet = new Set();
    for (const el of selectorElements) {
        if (!isNoiseElement(el)) {
            primarySet.add(el);
        }
    }

    const NATIVE_INTERACTIVE = 'a[href], button, input, textarea, select';
    const dedupedSet = new Set();
    for (const el of primarySet) {
        if (el.matches(NATIVE_INTERACTIVE) || !hasInteractiveAncestor(el, primarySet)) {
            dedupedSet.add(el);
        }
    }

    return dedupedSet;
}

function sortByDomOrder(elements) {
    return Array.from(elements).sort((a, b) => {
        const pos = a.compareDocumentPosition(b);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
}

function appendElements(sorted, results, index, limit, contextCache, dialogLabel) {
    for (const el of sorted) {
        if (index > limit) break;
        if (el.closest('#chromepilot-root')) continue;
        if (!isElementVisible(el)) continue;

        let sectionContext = dialogLabel || '';
        if (!sectionContext) {
            const parentKey = el.parentElement;
            if (contextCache.has(parentKey)) {
                sectionContext = contextCache.get(parentKey);
            } else {
                sectionContext = getElementContext(el);
                contextCache.set(parentKey, sectionContext);
            }
        }

        elementMap.set(index, el);
        results.push(formatElement(el, index, sectionContext));
        index++;
    }
    return index;
}

function extractInteractiveElements(maxElements) {
    maxElements = maxElements || DEFAULT_MAX_ELEMENTS;
    elementMap.clear();

    const allCandidates = collectCandidateElements();
    const activeDialogs = findActiveDialogs();
    const contextCache = new Map();
    const results = [];
    let index = 1;

    if (activeDialogs.length > 0) {
        // Collect dialog elements with relaxed filtering — dialogs are small,
        // so we grab ALL visible elements with text/label, not just interactive ones.
        // This catches framework-rendered buttons that lack ARIA/role attributes.
        const dialogElements = collectDialogElements(activeDialogs);
        const pageElements = new Set();

        for (const el of allCandidates) {
            // Skip elements already captured from dialogs
            if (dialogElements.has(el)) continue;
            const inDialog = activeDialogs.some(d => d.contains(el));
            if (!inDialog) {
                pageElements.add(el);
            }
        }

        // Dialog elements first — no cap, dialogs are small, feed everything
        const dialogLabel = activeDialogs.length === 1
            ? `dialog: ${getDialogTitle(activeDialogs[0])}`
            : '';
        const sortedDialog = sortByDomOrder(dialogElements);
        const dialogCount = sortedDialog.length;
        index = appendElements(sortedDialog, results, index, index + dialogCount, contextCache, dialogLabel);

        // Then page elements — still capped at maxElements for the page portion
        const sortedPage = sortByDomOrder(pageElements);
        index = appendElements(sortedPage, results, index, index + maxElements - 1, contextCache, '');
    } else {
        // No dialog — normal extraction
        const sorted = sortByDomOrder(allCandidates);
        index = appendElements(sorted, results, index, maxElements, contextCache, '');
    }

    let header = `Page: ${document.title}\nURL: ${location.href}\n`;
    if (activeDialogs.length > 0) {
        header += `⚠ Active dialog detected — dialog elements listed first.\n`;
    }
    header += '\n';
    return header + results.join('\n');
}

/**
 * Extract a human-readable title from a dialog container.
 */
function getDialogTitle(dialog) {
    const heading = dialog.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="header"]');
    if (heading) {
        const text = heading.textContent?.trim().replace(/\s+/g, ' ').substring(0, 40);
        if (text) return text;
    }
    const label = dialog.getAttribute('aria-label') || dialog.getAttribute('aria-labelledby');
    if (label) {
        if (dialog.getAttribute('aria-labelledby')) {
            const labelEl = document.getElementById(label);
            if (labelEl) return labelEl.textContent?.trim().substring(0, 40) || '';
        }
        return label.substring(0, 40);
    }
    return '';
}

function getElementByIndex(index) {
    return elementMap.get(index) || null;
}

// --- Debug Overlay ---

let debugRafId = null;
let debugScrollHandler = null;

function renderOverlayItems(container) {
    container.textContent = '';
    for (const [index, el] of elementMap) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const box = document.createElement('div');
        box.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;border:2px solid rgba(37,99,235,0.6);background:rgba(37,99,235,0.08);pointer-events:none;`;
        container.appendChild(box);

        const label = document.createElement('div');
        label.style.cssText = `position:fixed;left:${rect.left}px;top:${Math.max(0, rect.top - 18)}px;background:#2563eb;color:#fff;font-size:11px;font-weight:bold;padding:1px 4px;border-radius:3px;pointer-events:none;font-family:monospace;line-height:14px;`;
        label.textContent = `[${index}]`;
        container.appendChild(label);
    }
}

function showDebugOverlay() {
    removeDebugOverlay();
    extractInteractiveElements(); // refresh elementMap

    const container = document.createElement('div');
    container.id = 'chromepilot-debug-overlay';
    container.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    renderOverlayItems(container);
    document.body.appendChild(container);

    // Track scroll/resize to update positions
    debugScrollHandler = () => {
        if (debugRafId) return;
        debugRafId = requestAnimationFrame(() => {
            debugRafId = null;
            const c = document.getElementById('chromepilot-debug-overlay');
            if (c) renderOverlayItems(c);
        });
    };
    window.addEventListener('scroll', debugScrollHandler, true);
    window.addEventListener('resize', debugScrollHandler);
}

function removeDebugOverlay() {
    const existing = document.getElementById('chromepilot-debug-overlay');
    if (existing) existing.remove();
    if (debugScrollHandler) {
        window.removeEventListener('scroll', debugScrollHandler, true);
        window.removeEventListener('resize', debugScrollHandler);
        debugScrollHandler = null;
    }
    if (debugRafId) {
        cancelAnimationFrame(debugRafId);
        debugRafId = null;
    }
}

function isDebugOverlayActive() {
    return !!document.getElementById('chromepilot-debug-overlay');
}
