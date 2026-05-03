# Enhance ChatGPT

A Chrome extension that adds a restrained UI enhancement layer to the ChatGPT web app:

- Bulk conversation selection in the left conversation list
- Saved prompt dropdown above the bottom composer
- Lightweight conversation outline in the right whitespace

The extension is intentionally implemented as an augmentation layer. It avoids full-page modals, heavy surfaces, and layout-shifting DOM changes.

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
