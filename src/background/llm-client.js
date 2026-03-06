/**
 * ChromePilot LLM Client
 * Multi-provider LLM client supporting Anthropic and OpenAI-compatible APIs.
 */

const SYSTEM_PROMPT = `You are a browser automation assistant. The user gives you a command and a list of interactive elements on the current webpage. Each element has an index number in brackets like [1], [2], etc.

Respond with a JSON object containing an "actions" array. Each action has:
- "action": one of "click", "type", "scroll"
- "index": the element index number (required for click and type)
- "value": text to type (required for type action only)
- "direction": "up" or "down" (required for scroll only)
- "amount": pixels to scroll (for scroll only, default 500)
- "description": brief description of what this action does

If the user's command cannot be fulfilled with the available elements, respond with:
{"actions": [], "error": "explanation of why"}

Do NOT think or reason. Respond ONLY with the JSON object, no markdown, no other text, no reasoning.`;

async function callAnthropic(config, command, domContext) {
    const url = `${config.llmBaseUrl}/v1/messages`;
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
            messages: [
                {role: 'user', content: `Command: ${command}\n\nPage elements:\n${domContext}`}
            ]
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

async function callOpenAICompatible(config, command, domContext) {
    const url = `${config.llmBaseUrl}/v1/chat/completions`;
    const headers = {'Content-Type': 'application/json'};
    if (config.llmApiKey) {
        headers['Authorization'] = `Bearer ${config.llmApiKey}`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: config.llmModel,
            max_tokens: 4096,
            messages: [
                {role: 'system', content: SYSTEM_PROMPT},
                {role: 'user', content: `Command: ${command}\n\nPage elements:\n${domContext}`}
            ]
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const msg = data.choices[0].message;
    // Some models (e.g. qwen3) put output in reasoning field with empty content
    const text = msg.content || '';
    if (!text && msg.reasoning) {
        // Try to extract JSON from reasoning
        const jsonMatch = msg.reasoning.match(/\{[\s\S]*"actions"[\s\S]*\}/);
        if (jsonMatch) return jsonMatch[0];
    }
    return text;
}

export async function callLLM(config, command, domContext) {
    if (config.llmProvider === 'anthropic') {
        const text = await callAnthropic(config, command, domContext);
        return parseActionResponse(text);
    }
    const text = await callOpenAICompatible(config, command, domContext);
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
            return {actions: [], error: 'Response missing "actions" array'};
        }

        // Validate each action
        for (const action of parsed.actions) {
            if (!action.action) {
                return {actions: [], error: 'Action missing "action" field'};
            }
        }

        return parsed;
    } catch (error) {
        console.error('[ChromePilot] Failed to parse LLM response:', error, responseText);
        return {actions: [], error: `Failed to parse LLM response: ${error.message}`};
    }
}
