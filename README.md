<div align="center">

<img src="src/icons/icon.png" alt="ChromePilot" width="128">

# ChromePilot

**Control any webpage using natural language.**

A Chrome extension that lets you automate browser actions — click, type, scroll, navigate — just by describing what you
want in plain English or Chinese.

[![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](#features) · [中文](README_CN.md)

</div>

---

## Features

- **Natural Language Control** — Type commands like "click the login button" or "fill in my email" and ChromePilot does
  it for you
- **Multi-step Automation** — Chain complex tasks: "Go to Habitica and complete all my daily tasks"
- **URL Navigation** — Say "open YouTube" or "go to google.com" to navigate anywhere
- **Smart Result Extraction** — Ask "translate 'hello' on Google Translate" and get the answer directly in the chat
- **Persistent Side Panel** — The panel stays open across tab switches (powered by Chrome's native Side Panel API)
- **Multi-provider LLM Support** — Works with OpenAI, Anthropic Claude, GitHub Copilot, Ollama (local), or any
  OpenAI-compatible API
- **Configurable Execution** — Adjust action delay, max steps, and open-in-new-tab behavior from the panel header
- **Dialog Awareness** — Automatically detects and prioritizes popups, modals, and dialogs
- **Teach Mode** — Record your actions to demonstrate workflows, then replay them with AI assistance
- **Action Preview & Confirm** — Review planned actions with visual highlights before execution; provide feedback to
  re-analyze

## Demo

### Basic Actions — Click, Type, Scroll

> Command: *"drink water 10 times"*

![Basic actions demo](docs/images/1.%20drink%20water%2010%20times.gif)

### In-page Navigation — Multi-step Tasks

> Command: *"go to tasks and drink water 10 times"*

![In-page navigation demo](docs/images/2.%20go%20to%20tasks%20and%20drink%20water%2010%20times.gif)

### Cross-page Navigation — Open URLs & Extract Results

> Command: *"go to Google Translate and translate 'what is surprise' to Chinese"*

![Cross-page navigation demo](docs/images/3.%20go%20to%20google%20translator%20and%20translat%20what%20is%20superpise%20to%20chinese.gif)

### Cross-site Automation — Navigate & Interact

> Command: *"go to my github homepage and star the repository ChromePilot"*

![Cross-site automation demo](docs/images/4.%20go%20to%20my%20github%20homepage%20and%20star%20the%20repository%20ChromePilot.gif)

### Debug Overlay — Inspect Detected Elements

> Use the 👁 button to visualize all detected interactive elements with their index numbers.

![Debug overlay demo](docs/images/5.%20click%20button%2054.gif)

### Action Preview & Confirm — Review Before Execution

> Actions are highlighted with numbered labels. Confirm to execute, or type feedback and re-analyze.

![Action preview demo](docs/images/6.%20show%20batch%20actions%20with%20confirm%20first.gif)

### Auto-run Mode — Skip Confirmation

> Toggle "Auto-run" to execute actions immediately without preview.

![Auto-run demo](docs/images/7.%20show%20the%20auto-run.gif)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/GOODDAYDAY/ChromePilot.git
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in the top right)

4. Click **Load unpacked** and select the `src` folder

5. Click the ChromePilot icon in the toolbar to open the side panel

## Configuration

1. Right-click the ChromePilot icon → **Options** (or go to `chrome://extensions` → ChromePilot → Details → Extension
   options)

2. Select a **Provider Preset**:

| Provider         | Base URL                                | Notes                 |
|------------------|-----------------------------------------|-----------------------|
| OpenAI           | `https://api.openai.com`                | Requires API key      |
| Anthropic Claude | `https://api.anthropic.com`             | Requires API key      |
| GitHub Copilot   | `https://models.inference.ai.azure.com` | Requires GitHub token |
| Ollama (Local)   | `http://localhost:11434`                | Free, runs locally    |
| Custom           | Any OpenAI-compatible endpoint          |                       |

3. Enter your **API Key** and **Model** name

4. Click **Test Connection** to verify, then **Save**

### Panel Settings

The side panel header provides quick settings:

| Setting      | Options                      | Default | Description                                         |
|--------------|------------------------------|---------|-----------------------------------------------------|
| Same tab     | On/Off                       | Off     | Navigate in current tab instead of opening new tabs |
| Auto-run     | On/Off                       | Off     | Skip action preview, execute immediately            |
| Max Steps    | 5 / 10 / 20 / 50 / Unlimited | 10      | Maximum LLM rounds per command                      |
| Action Delay | 0s – 5s                      | 0.5s    | Delay between each action execution                 |

## Supported Actions

| Action       | Description                   | Example Command                        |
|--------------|-------------------------------|----------------------------------------|
| **click**    | Click any interactive element | "click the submit button"              |
| **type**     | Type text into input fields   | "type 'hello world' in the search box" |
| **scroll**   | Scroll the page               | "scroll down"                          |
| **navigate** | Open a URL                    | "open YouTube", "go to baidu.com"      |
| **read**     | Extract text from the page    | "what does the error message say?"     |

## Architecture

```
src/
├── manifest.json              # Chrome MV3 manifest
├── background/
│   ├── service-worker.js      # Orchestrator: DOM → LLM → Actions loop
│   └── llm-client.js          # Multi-provider LLM client
├── content/
│   ├── content-script.js      # Message handler on web pages
│   ├── dom-extractor.js       # Extracts interactive elements
│   ├── action-executor.js     # Simulates click/type/scroll/read
│   ├── action-previewer.js    # Preview overlay (red borders + step labels)
│   └── action-recorder.js     # Teach mode action recording
├── sidepanel/
│   ├── sidepanel.html         # Chat UI (Chrome Side Panel API)
│   ├── sidepanel.js           # Panel logic & settings
│   └── sidepanel.css          # Styles
├── options/                   # LLM provider configuration page
├── lib/utils.js               # Shared helpers
└── icons/                     # Extension icons
```

### How It Works

1. User types a command in the side panel
2. Service worker extracts interactive elements from the active tab
3. Elements + command are sent to the configured LLM
4. LLM returns a list of actions (click, type, scroll, navigate, read)
5. Actions are previewed with red highlights and step labels (unless Auto-run is on)
6. User confirms or provides feedback to re-analyze
7. Confirmed actions are executed sequentially on the page
8. If the task isn't done (`done: false`), repeat from step 2

## Requirements

- Chrome 114+ (for Side Panel API support)
- An LLM API endpoint (cloud or local)

## License

MIT

