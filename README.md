<div align="center">
  <img src="public/icons/icon.svg" alt="EnhanceGPT icon" width="96" height="96">
  <h1>EnhanceGPT</h1>
</div>

<p align="center">
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.0.0-149eca?logo=react&logoColor=white" alt="React 19.0.0"></a>
  <a href="https://www.radix-ui.com/"><img src="https://img.shields.io/badge/Radix%20UI-1.3.2%20%2F%201.2.8-161618?logo=radixui&logoColor=white" alt="Radix UI 1.3.2 / 1.2.8"></a>
  <a href="https://www.npmjs.com/"><img src="https://img.shields.io/badge/npm-%3E%3D10-cb3837?logo=npm&logoColor=white" alt="npm >=10"></a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285f4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3"></a>
</p>
<div align="center">
    <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
</div>
<br>
EnhanceGPT is a Chrome extension that adds native-feeling bulk chat management, reusable prompt snippets, and conversation outlines to the ChatGPT web app. It is implemented as a restrained augmentation layer, avoiding full-page modals, heavy surfaces, and layout-shifting DOM changes.

## Key Features

- Bulk-select conversations from the left sidebar for faster multi-chat workflows.
- Archive or delete selected conversations from a focused bulk-action surface.
- Save, edit, and reuse prompt snippets from a compact dropdown above the composer.
- Generate a lightweight conversation outline in the right whitespace for quicker thread navigation.
- Keep the experience native-feeling, lightweight, and unobtrusive.

## Feature Showcase

<table>
  <tr>
    <th>Bulk Operation</th>
  </tr>
  <tr>
    <td><img src="assets/bulk%20manager.gif" alt="Bulk conversation manager demo" width="100%"></td>
  </tr>
  <tr>
    <th>Prompt Manager</th>
  </tr>
  <tr>
    <td><img src="assets/prompt%20manager.gif" alt="Prompt manager demo" width="100%"></td>
  </tr>
  <tr>
    <th>Conversation Outline</th>
  </tr>
  <tr>
    <td><img src="assets/outline.gif" alt="Conversation outline demo" width="100%"></td>
  </tr>
</table>

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Chrome or a Chromium-based browser with Manifest V3 support

## Development

```bash
npm install
```

## Build And Load In Chrome

```bash
npm run build
```

Then load the `dist` directory in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select "Load unpacked".
4. Choose this repo's `dist` folder.

## Project Structure

```text
public/manifest.json        Manifest V3 extension manifest
src/content/                ChatGPT content script and injected UI
src/shared/                 Shared constants and prompt types
vite.content.config.ts      IIFE build for manifest content script
```

## Implementation Notes

- The content script is scoped to `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- Prompt snippets are stored in `chrome.storage.local`, with `localStorage` fallback for non-extension development contexts.
- Bulk delete/archive buttons currently emit `ecg:bulk-conversation-action` browser events instead of calling private ChatGPT APIs. This keeps the first version safe until a stable, explicit native-action adapter is implemented.
- CSS is prefixed with `ecg-` and loaded as a static content-script stylesheet.
- Conversation outlines prefer ChatGPT's conversation JSON endpoint so long threads can be indexed before every message is mounted in the DOM.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

## References

- Chrome Manifest V3 and manifest structure: https://developer.chrome.com/docs/extensions/reference/manifest
- Static content scripts: https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- Extension storage: https://developer.chrome.com/docs/extensions/reference/api/storage
- Extension icons: https://developer.chrome.com/docs/extensions/reference/manifest/icons
