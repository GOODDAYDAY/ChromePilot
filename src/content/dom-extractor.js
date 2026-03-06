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
    '[tabindex]',
    '[data-action]',
    '[contenteditable="true"]'
].join(', ');

const MAX_ELEMENTS = 500;
const MAX_TEXT_LENGTH = 100;
const MAX_CLASS_LENGTH = 80;

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
    // Check for cursor pointer style (common indicator of clickable elements)
    const style = getComputedStyle(el);
    if (style.cursor === 'pointer') return true;
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
    if (el.className && typeof el.className === 'string') {
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

function extractInteractiveElements() {
    elementMap.clear();

    // Phase 1: standard interactive selectors
    const selectorElements = new Set(document.querySelectorAll(INTERACTIVE_SELECTORS));

    // Phase 2: find cursor:pointer elements (framework-rendered clickable divs/spans)
    const allElements = document.querySelectorAll('div, span, li, label, svg, img, td');
    for (const el of allElements) {
        if (selectorElements.size + selectorElements.size > 2000) break;
        if (hasClickListener(el)) {
            // Avoid adding a parent if we already have its interactive child
            const hasInteractiveChild = el.querySelector(INTERACTIVE_SELECTORS);
            if (!hasInteractiveChild) {
                selectorElements.add(el);
            }
        }
    }

    const results = [];
    let index = 1;

    // Sort by DOM order
    const sorted = Array.from(selectorElements).sort((a, b) => {
        const pos = a.compareDocumentPosition(b);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    // Track sections for context
    const contextCache = new Map();

    for (const el of sorted) {
        if (index > MAX_ELEMENTS) break;
        if (el.closest('#chromepilot-root')) continue;
        if (!isElementVisible(el)) continue;

        // Get section context (cached per parent section)
        let sectionContext = '';
        const parentKey = el.parentElement;
        if (contextCache.has(parentKey)) {
            sectionContext = contextCache.get(parentKey);
        } else {
            sectionContext = getElementContext(el);
            contextCache.set(parentKey, sectionContext);
        }

        elementMap.set(index, el);
        results.push(formatElement(el, index, sectionContext));
        index++;
    }

    return results.join('\n');
}

function getElementByIndex(index) {
    return elementMap.get(index) || null;
}
