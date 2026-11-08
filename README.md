# Tearcopy

Select text on a page and press Ctrl+C or ⌘C. The selection lifts off as ragged paper strips, curls toward a corner, and the page heals underneath. The real copy still happens. The DOM, the layout, and the clipboard are left alone.

Created by Ravi. This is an initial version for Open Dev Society, meant to be taken over and improved.

**Tearcopy is not yet published to npm.** The package is marked private. Install dependencies from this repo; do not expect a registry package.

## Run it locally

```bash
npm install
npx playwright install chromium firefox
npm run dev
```

Open the URL Vite prints (http://127.0.0.1:5173). Select a sentence in the essay and press Ctrl+C or ⌘C. Paste into the box at the bottom with Ctrl+V or ⌘V.

```bash
npm test
npm run typecheck
npm run build
```

`npm test` runs the unit tests, then Playwright in Chromium and Firefox.

`npm run build` writes:

- `packages/tearcopy/dist` — ESM build and declarations
- `playground/dist` — static site

The playground build uses relative asset paths so it can be uploaded to Cloudflare Pages later. Nothing in this repo deploys or publishes for you.

## What to edit

| File | What it is |
| --- | --- |
| `packages/tearcopy/src/index.ts` | Copy listener, scraps, flight, cleanup |
| `packages/tearcopy/src/geometry.ts` | Merging client rects into visual lines |
| `packages/tearcopy/src/skip.ts` | Fields, editables, and opt-outs |
| `packages/tearcopy/src/react.ts` | `useTearcopy` hook |
| `playground/src/App.tsx` | Demo page |
| `playground/src/styles.css` | Demo styles |

The playground imports the TypeScript source. You do not need to rebuild the library to refresh the demo.

## API

```ts
import { tearcopy } from "tearcopy";

const stop = tearcopy({
  root: document,             // listen here; default document
  paper: "cream",             // "cream" | "receipt" | "kraft"
  corner: "bottom-right",     // top-left | top-right | bottom-left | bottom-right
  duration: 980,              // flight, in ms
  maxLines: 8,                // further lines share the last scrap
  reducedMotion: "fade",      // "fade" | "none" when the OS asks for less motion
  onTear: ({ lines }) => {},  // line count only, never the text
});

stop(); // remove the listener, cancel scraps, drop the overlay. Safe to call twice.
```

React, as an optional peer (the core library does not import it):

```ts
import { useTearcopy } from "tearcopy/react";

useTearcopy({ paper: "kraft", corner: "top-right" });
```

Add `data-tearcopy-ignore` to any subtree that should not tear.

## Privacy

Tearcopy does not read or write the clipboard, does not ask for clipboard permission, and does not keep the copied text after the animation. There is no pocket, no storage, no network, and no telemetry. The overlay is `aria-hidden`, non-interactive, and removed when the flight ends or `stop()` runs.

## Known limits

- One call per page. A second `tearcopy()` without stopping the first stacks another listener.
- The scrap is a styled clone of the line’s block, clipped to the selection. `::before` / `::first-line`, webfonts that are not loaded yet, and background images are not reproduced.
- Rotated, scaled, RTL, vertical, and multi-column text fades in place as a blank scrap. It does not fly.
- A selection covering more than about 40% of the window also fades in place. Past `maxLines`, the leftover lines share one scrap.
- Shadow DOM, iframes, text fields, textareas, passwords, contenteditables, and `[data-tearcopy-ignore]` are skipped.
- The overlay stays fixed if the page scrolls mid-flight.
- Light text is torn onto a dark scrap so it stays readable. The paper colour is a flat preset, not a sample of a background image.
- At most three tears run at once. A fourth cancels the oldest.
- Safari has not been part of the automated run. The effect uses the Web Animations API and CSS clip paths.

## Next

A pocket of recent copies, an npm publish, and a Cloudflare Pages deploy of `playground/dist`. None of those are in this version.

## License

MIT. Copyright (c) 2026 Ravi.
