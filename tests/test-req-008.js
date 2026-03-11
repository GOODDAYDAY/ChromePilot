/**
 * REQ-008 Action Preview & Confirm — Unit Tests
 * Tests core logic without requiring a browser environment.
 * Run with: node tests/test-req-008.js
 */

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        failed++;
    }
}

// --- Test helpers: simulate minimal environment ---

function createMockElementMap() {
    return new Map([
        [1, {tag: 'button', text: 'Submit'}],
        [2, {tag: 'input', placeholder: 'Email'}],
        [3, {tag: 'a', text: 'Home'}]
    ]);
}

// ============================================================
// Test 1: Manifest includes action-previewer.js
// ============================================================
console.log('\n[Test 1] Manifest includes action-previewer.js');
{
    const fs = require('fs');
    const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
    const scripts = manifest.content_scripts[0].js;
    assert(scripts.includes('content/action-previewer.js'), 'action-previewer.js in content_scripts');
    assert(scripts.indexOf('content/action-previewer.js') < scripts.indexOf('content/content-script.js'),
        'action-previewer.js loaded before content-script.js');
}

// ============================================================
// Test 2: Service worker has preview message handlers
// ============================================================
console.log('\n[Test 2] Service worker message handlers');
{
    const fs = require('fs');
    const sw = fs.readFileSync('src/background/service-worker.js', 'utf8');
    assert(sw.includes("message.type === 'CONFIRM_ACTIONS'"), 'CONFIRM_ACTIONS handler exists');
    assert(sw.includes("message.type === 'REJECT_ACTIONS'"), 'REJECT_ACTIONS handler exists');
    assert(sw.includes("previewResolve({decision: 'confirm'})"), 'Confirm resolves promise with confirm');
    assert(sw.includes("decision: 'reject', feedback:"), 'Reject resolves promise with reject + feedback');
    assert(sw.includes("previewResolve({decision: 'cancel'})"), 'Cancel resolves promise with cancel');
}

// ============================================================
// Test 3: Preview-confirm loop in handleExecuteCommand
// ============================================================
console.log('\n[Test 3] Preview-confirm loop logic');
{
    const fs = require('fs');
    const sw = fs.readFileSync('src/background/service-worker.js', 'utf8');
    assert(sw.includes("chrome.storage.sync.get('autoConfirm')"), 'Reads autoConfirm setting');
    assert(sw.includes('autoConfirmConfig.autoConfirm === true'), 'Checks autoConfirm strictly');
    assert(sw.includes('let confirmed = autoConfirm'), 'Sets confirmed = autoConfirm');
    assert(sw.includes('while (!confirmed)'), 'Preview loop: while (!confirmed)');
    assert(sw.includes("type: 'PREVIEW_ACTIONS'"), 'Sends PREVIEW_ACTIONS to content');
    assert(sw.includes("type: 'ACTION_PREVIEW'"), 'Sends ACTION_PREVIEW to panel');
    assert(sw.includes("type: 'REMOVE_PREVIEW'"), 'Sends REMOVE_PREVIEW on decision');
    assert(sw.includes('MAX_REJECTIONS_PER_STEP'), 'Uses MAX_REJECTIONS_PER_STEP constant');
}

// ============================================================
// Test 4: Rejection count and max rejections
// ============================================================
console.log('\n[Test 4] Rejection count limit');
{
    const fs = require('fs');
    const sw = fs.readFileSync('src/background/service-worker.js', 'utf8');
    assert(sw.includes('const MAX_REJECTIONS_PER_STEP = 3'), 'Max rejections = 3');
    assert(sw.includes('rejectionCount >= MAX_REJECTIONS_PER_STEP'), 'Checks rejection limit');
    assert(sw.includes('let rejectionCount = 0'), 'Rejection count resets per step');
    assert(sw.includes('rejectionCount++'), 'Increments rejection count');
    assert(sw.includes('rephrase your command'), 'Shows rephrase message on limit');
}

// ============================================================
// Test 5: Rejected plan appended to conversation history
// ============================================================
console.log('\n[Test 5] Rejection context in history');
{
    const fs = require('fs');
    const sw = fs.readFileSync('src/background/service-worker.js', 'utf8');
    assert(sw.includes('rejected: true'), 'Rejected marker in history entry');
    assert(sw.includes('User REJECTED the planned actions'), 'Rejection message in results');

    const llm = fs.readFileSync('src/background/llm-client.js', 'utf8');
    assert(llm.includes('entry.rejected'), 'LLM client checks rejected flag');
    assert(llm.includes('User REJECTED the planned actions. Please suggest different actions.'),
        'LLM formats rejection message');
}

// ============================================================
// Test 6: Content script routes PREVIEW_ACTIONS and REMOVE_PREVIEW
// ============================================================
console.log('\n[Test 6] Content script message routing');
{
    const fs = require('fs');
    const cs = fs.readFileSync('src/content/content-script.js', 'utf8');
    assert(cs.includes("case 'PREVIEW_ACTIONS'"), 'PREVIEW_ACTIONS case in switch');
    assert(cs.includes('showActionPreview(message.actions)'), 'Calls showActionPreview');
    assert(cs.includes("case 'REMOVE_PREVIEW'"), 'REMOVE_PREVIEW case in switch');
    assert(cs.includes('removeActionPreview()'), 'Calls removeActionPreview in REMOVE_PREVIEW');
    // Also verify CANCEL_ACTIONS cleans up preview
    assert(cs.includes("case 'CANCEL_ACTIONS'") && cs.includes('removeActionPreview()'),
        'CANCEL_ACTIONS also removes preview');
}

// ============================================================
// Test 7: action-previewer.js structure
// ============================================================
console.log('\n[Test 7] action-previewer.js module structure');
{
    const fs = require('fs');
    const ap = fs.readFileSync('src/content/action-previewer.js', 'utf8');
    assert(ap.includes('function showActionPreview(actions)'), 'showActionPreview function defined');
    assert(ap.includes('function removeActionPreview()'), 'removeActionPreview function defined');
    assert(ap.includes('function isPreviewActive()'), 'isPreviewActive function defined');
    assert(ap.includes('function renderPreviewItems(container, actions)'), 'renderPreviewItems internal function');
    assert(ap.includes('function formatPreviewLabel(stepNum, action)'), 'formatPreviewLabel internal function');
    assert(ap.includes("chromepilot-preview-overlay"), 'Uses chromepilot-preview-overlay ID');
    assert(ap.includes('2147483645'), 'z-index = 2147483645');
    assert(ap.includes('#ef4444'), 'Red border color #ef4444');
}

// ============================================================
// Test 8: Preview overlay styling matches spec
// ============================================================
console.log('\n[Test 8] Preview overlay styling');
{
    const fs = require('fs');
    const ap = fs.readFileSync('src/content/action-previewer.js', 'utf8');
    assert(ap.includes('border:3px solid #ef4444'), 'Border: 3px solid #ef4444');
    assert(ap.includes('rgba(239,68,68,0.10)'), 'Background: rgba(239,68,68,0.10)');
    assert(ap.includes('background:#ef4444;color:#fff'), 'Label: red bg, white text');
    assert(ap.includes('font-size:11px;font-weight:bold'), 'Label: 11px bold');
}

// ============================================================
// Test 9: Side panel preview card UI
// ============================================================
console.log('\n[Test 9] Side panel preview card');
{
    const fs = require('fs');
    const sp = fs.readFileSync('src/sidepanel/sidepanel.js', 'utf8');
    assert(sp.includes('function showPreviewCard(actions, warnings, step, maxSteps)'),
        'showPreviewCard function defined');
    assert(sp.includes('function removePreviewCard()'), 'removePreviewCard function defined');
    assert(sp.includes("'preview-card'") || sp.includes('preview-card'), 'preview-card class used');
    assert(sp.includes("'CONFIRM_ACTIONS'"), 'Sends CONFIRM_ACTIONS message');
    assert(sp.includes("'REJECT_ACTIONS'"), 'Sends REJECT_ACTIONS message');
    assert(sp.includes('Confirm'), 'Confirm button text');
    assert(sp.includes('Re-analyze'), 'Re-analyze button text');
    assert(sp.includes("case 'ACTION_PREVIEW'"), 'ACTION_PREVIEW message handler');
}

// ============================================================
// Test 10: Side panel CSS for preview card
// ============================================================
console.log('\n[Test 10] Side panel CSS styles');
{
    const fs = require('fs');
    const css = fs.readFileSync('src/sidepanel/sidepanel.css', 'utf8');
    assert(css.includes('.preview-card'), '.preview-card style exists');
    assert(css.includes('.preview-header'), '.preview-header style exists');
    assert(css.includes('.preview-actions-list'), '.preview-actions-list style exists');
    assert(css.includes('.preview-btn-confirm'), '.preview-btn-confirm style exists');
    assert(css.includes('.preview-btn-reject'), '.preview-btn-reject style exists');
    assert(css.includes('.preview-warnings'), '.preview-warnings style exists');
    assert(css.includes('#16a34a'), 'Confirm button green (#16a34a)');
    assert(css.includes('#f97316'), 'Reject button orange (#f97316)');
}

// ============================================================
// Test 11: Side panel auto-confirm toggle
// ============================================================
console.log('\n[Test 11] Side panel autoConfirm toggle');
{
    const fs = require('fs');
    const html = fs.readFileSync('src/sidepanel/sidepanel.html', 'utf8');
    const js = fs.readFileSync('src/sidepanel/sidepanel.js', 'utf8');
    assert(html.includes('id="autoConfirm"'), 'HTML has autoConfirm checkbox');
    assert(html.includes('Auto-run'), 'HTML has short label "Auto-run"');
    assert(js.includes("document.getElementById('autoConfirm')"), 'JS gets autoConfirm element');
    assert(js.includes("autoConfirm: autoConfirmEl.checked"), 'JS saves autoConfirm on change');
    assert(js.includes('data.autoConfirm'), 'JS loads autoConfirm from storage');
}

// ============================================================
// Test 12: Default storage includes autoConfirm
// ============================================================
console.log('\n[Test 12] Default storage');
{
    const fs = require('fs');
    const sw = fs.readFileSync('src/background/service-worker.js', 'utf8');
    assert(sw.includes('autoConfirm: false'), 'DEFAULT_STORAGE includes autoConfirm: false');
}

// ============================================================
// Test 13: formatActionForDisplay handles both LLM and teach mode
// ============================================================
console.log('\n[Test 13] formatActionForDisplay dual support');
{
    const fs = require('fs');
    const sp = fs.readFileSync('src/sidepanel/sidepanel.js', 'utf8');
    assert(sp.includes('action.description'), 'Uses action.description if available');
    assert(sp.includes('action.index != null'), 'Handles LLM actions with index');
    assert(sp.includes('action.element'), 'Still handles teach mode actions with element');
}

// ============================================================
// Test 14: User feedback with rejection
// ============================================================
console.log('\n[Test 14] User feedback on rejection');
{
    const fs = require('fs');
    const sp = fs.readFileSync('src/sidepanel/sidepanel.js', 'utf8');
    const sw = fs.readFileSync('src/background/service-worker.js', 'utf8');
    const llm = fs.readFileSync('src/background/llm-client.js', 'utf8');

    // Side panel: input enabled during preview, feedback sent with reject
    assert(sp.includes('inputEl.disabled = false') && sp.includes('Type feedback'),
        'Input field enabled during preview with feedback placeholder');
    assert(sp.includes('const feedback = inputEl.value.trim()'),
        'Grabs feedback text from input on reject');
    assert(sp.includes("type: 'REJECT_ACTIONS', feedback"),
        'Sends feedback with REJECT_ACTIONS message');

    // Service worker: passes feedback into history
    assert(sw.includes('result.feedback'), 'SW reads feedback from reject result');
    assert(sw.includes('feedback: result.feedback'), 'SW stores feedback in history entry');
    assert(sw.includes('User feedback:'), 'SW includes user feedback in rejection message');

    // LLM client: formats feedback in rejection context
    assert(llm.includes('entry.feedback'), 'LLM client checks entry.feedback');
    assert(llm.includes('User feedback:'), 'LLM client includes feedback in message');
}

// ============================================================
// Test 15: Input placeholder restored after preview
// ============================================================
console.log('\n[Test 15] Input placeholder restoration');
{
    const fs = require('fs');
    const sp = fs.readFileSync('src/sidepanel/sidepanel.js', 'utf8');
    assert(sp.includes("inputEl.placeholder = 'Type a command...'"),
        'Placeholder restored to default in removePreviewCard');
}

// ============================================================
// Test 16: Ensure no innerHTML usage (security)
// ============================================================
console.log('\n[Test 16] Security: no innerHTML');
{
    const fs = require('fs');
    const files = [
        'src/content/action-previewer.js',
        'src/sidepanel/sidepanel.js',
        'src/options/options.js'
    ];
    let clean = true;
    for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');
        if (content.includes('innerHTML')) {
            console.log(`  FAIL: ${f} uses innerHTML`);
            clean = false;
            failed++;
        }
    }
    if (clean) {
        assert(true, 'No innerHTML in new/modified files');
    }
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed!');
}
