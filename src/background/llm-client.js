/**
 * ChromePilot LLM Client
 * Multi-provider LLM client supporting Anthropic and OpenAI-compatible APIs.
 */

const SYSTEM_PROMPT = `You are a browser automation assistant. The user gives you a command and a list of interactive elements on the current webpage. Each element has an index number in brackets like [1], [2], etc.

Respond with a JSON object containing:
- "actions": array of actions to perform (BATCH as many actions as possible into one response!)
- "done": true if the task is fully complete after these actions, false if more steps are needed
- "summary": when done, provide the FINAL ANSWER or result here. This is what the user sees.

Each action has:
- "action": one of "click", "type", "scroll", "navigate", "read", "repeat"
- "index": the element index number (required for click, type, read, and repeat)
- "value": text to type (required for type action only)
- "direction": "up" or "down" (required for scroll only)
- "amount": pixels to scroll (for scroll only, default 500)
- "url": the URL to open (required for navigate action)
- "times": number of times to repeat (required for repeat action)
- "description": brief description of what this action does

Actions:
- "read": extract text content from an element. The extracted text will be returned in the results.
- "repeat": click an element N times. Use this for repetitive tasks like "click X 100 times" instead of returning 100 separate click actions. This executes locally without additional LLM calls.

CRITICAL RULES:
1. Batch multiple actions into a SINGLE response when possible. If the user says "click all checkboxes", return ALL click actions in one response. Each round-trip is expensive — minimize rounds.
2. Only set "done": false when the page needs to reload/change before you can continue (navigation, form submission, new content loading).
3. When the task is to LOOK UP, TRANSLATE, SEARCH, or QUERY information: once the answer is visible in the page elements, STOP immediately. Set "done": true and put the answer in "summary". Do NOT perform extra unnecessary actions like copying, scrolling, or clicking after the result is already visible.
4. The "summary" field is shown directly to the user. For lookup tasks, include the actual result (e.g. "翻译结果: surprise"). For action tasks, summarize what was done.

For navigate: use full URLs. For common sites use their real URLs (e.g. "百度" → "https://www.baidu.com", "YouTube" → "https://www.youtube.com").

If the user's command cannot be fulfilled with the available elements, respond with:
{"actions": [], "done": true, "error": "explanation of why"}

Do NOT think or reason. Respond ONLY with the JSON object, no markdown, no other text, no reasoning.`;

const MAX_CONTEXT_CHARS = 12000; // ~3000 tokens, leaves room for system prompt + history

function truncateContext(domContext) {
    if (domContext.length <= MAX_CONTEXT_CHARS) return domContext;
    return domContext.substring(0, MAX_CONTEXT_CHARS) + '\n... (truncated)';
}

function buildMessages(command, domContext, history) {
    const dom = truncateContext(domContext);
    const messages = [];

    if (history.length === 0) {
        messages.push({
            role: 'user',
            content: `Command: ${command}\n\nPage elements:\n${dom}`
        });
        return messages;
    }

    // First turn: original command (no DOM — it's stale by now)
    messages.push({
        role: 'user',
        content: `Command: ${command}`
    });

    // Only keep last 3 history entries to limit tokens
    const recentHistory = history.slice(-3);

    for (let i = 0; i < recentHistory.length; i++) {
        const entry = recentHistory[i];
        // Assistant's actions (compact: only action + index + description)
        const compactActions = entry.actions.map(a => {
            const o = {action: a.action};
            if (a.index != null) o.index = a.index;
            if (a.url) o.url = a.url;
            if (a.description) o.desc = a.description;
            return o;
        });
        messages.push({
            role: 'assistant',
            content: JSON.stringify({actions: compactActions, done: false})
        });
        // Results (compact)
        const resultSummary = entry.results.map(r =>
            `${r.success ? 'OK' : 'FAIL'}: ${r.message}`
        ).join('\n');
        messages.push({
            role: 'user',
            content: `Results:\n${resultSummary}`
        });
    }

    // Final user message: current DOM for this step
    messages.push({
        role: 'user',
        content: `Continue the task. Current page elements:\n${dom}`
    });

    return messages;
}

async function callAnthropic(config, command, domContext, history) {
    const url = `${config.llmBaseUrl}/v1/messages`;
    const messages = buildMessages(command, domContext, history);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.llmApiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: config.llmModel,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

async function callOpenAICompatible(config, command, domContext, history) {
    const url = `${config.llmBaseUrl}/v1/chat/completions`;
    const headers = {'Content-Type': 'application/json'};
    if (config.llmApiKey) {
        headers['Authorization'] = `Bearer ${config.llmApiKey}`;
    }

    const userMessages = buildMessages(command, domContext, history);

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: config.llmModel,
            max_tokens: 4096,
            messages: [
                {role: 'system', content: SYSTEM_PROMPT},
                ...userMessages
            ]
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const msg = data.choices[0].message;
    const text = msg.content || '';
    if (!text && msg.reasoning) {
        const jsonMatch = msg.reasoning.match(/\{[\s\S]*"actions"[\s\S]*\}/);
        if (jsonMatch) return jsonMatch[0];
    }
    return text;
}

export async function callLLM(config, command, domContext, history = []) {
    if (config.llmProvider === 'anthropic') {
        const text = await callAnthropic(config, command, domContext, history);
        return parseActionResponse(text);
    }
    const text = await callOpenAICompatible(config, command, domContext, history);
    return parseActionResponse(text);
}

export function parseActionResponse(responseText) {
    try {
        let text = responseText.trim();

        // Strip markdown code fences if present
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
            text = fenceMatch[1].trim();
        }

        const parsed = JSON.parse(text);

        if (!parsed.actions || !Array.isArray(parsed.actions)) {
            return {actions: [], done: true, error: 'Response missing "actions" array'};
        }

        // Validate each action
        for (const action of parsed.actions) {
            if (!action.action) {
                return {actions: [], done: true, error: 'Action missing "action" field'};
            }
        }

        // Default done to true if not specified
        if (typeof parsed.done !== 'boolean') {
            parsed.done = true;
        }

        return parsed;
    } catch (error) {
        console.error('[ChromePilot] Failed to parse LLM response:', error, responseText);
        return {actions: [], done: true, error: `Failed to parse LLM response: ${error.message}`};
    }
}
