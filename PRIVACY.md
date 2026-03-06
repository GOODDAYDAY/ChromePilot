# Privacy Policy — ChromePilot

**Last updated:** 2026-03-07

## Overview

ChromePilot is a Chrome extension that lets users control webpages using natural language commands. This privacy policy
explains what data the extension accesses and how it is handled.

## Data Collection

ChromePilot does **NOT** collect, store, or transmit any personal data to the extension developer.

## Data Access

The extension accesses the following data solely to perform its core functionality:

### Webpage Content

- ChromePilot injects content scripts into webpages to extract interactive elements (buttons, links, inputs, etc.) and
  execute user-requested actions (click, type, scroll).
- This data is processed locally in the browser and is **not** stored or transmitted to the developer.

### User Commands

- Commands typed by the user in the side panel are sent to the user's **self-configured** LLM API endpoint (e.g.,
  OpenAI, Anthropic, Ollama) along with the extracted page elements.
- The extension developer has **no access** to these commands or API responses.
- The user is fully responsible for choosing and configuring their LLM provider.

### LLM API Configuration

- API keys, base URLs, and model names are stored locally in `chrome.storage.sync` for the user's convenience.
- These credentials are **only** sent to the API endpoint the user has configured. They are never sent anywhere else.

### Extension Settings

- User preferences (action delay, max steps, open-in-current-tab toggle) are stored locally in `chrome.storage.sync`.
- No settings data leaves the user's browser.

## Third-party Services

ChromePilot communicates with third-party LLM APIs **only as configured by the user**. The extension developer is not
affiliated with any LLM provider. Users should review the privacy policies of their chosen LLM provider.

## Permissions Justification

| Permission                     | Reason                                                              |
|--------------------------------|---------------------------------------------------------------------|
| `activeTab`                    | Access the current tab to extract page elements and execute actions |
| `storage`                      | Store user preferences and LLM configuration locally                |
| `scripting`                    | Inject content scripts into pages after navigation                  |
| `sidePanel`                    | Provide a persistent chat panel in Chrome's side panel              |
| `host_permissions: <all_urls>` | The extension must work on any webpage the user wants to control    |

## Data Retention

ChromePilot does not persist any webpage content or command history beyond the current session. Chat history is cleared
when the side panel is closed or the user clicks the clear button.

## Changes to This Policy

Any changes to this privacy policy will be reflected in this document with an updated date.

## Contact

If you have questions about this privacy policy, please open an issue on
the [GitHub repository](https://github.com/GOODDAYDAY/ChromePilot/issues).
