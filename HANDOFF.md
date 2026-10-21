# Orbix Studio deck — developer handoff

## Start here

The ZIP includes the complete React/TypeScript source, all active slide and animation assets, readable/AI exports, a downloadable PDF, verification reports, and a ready-built `dist/` folder. No backend, API keys, or environment secrets are required.

Use Node.js 22.12 or newer; this handoff is tested with Node 24.11.1. Extract the ZIP, open a terminal inside `orbix-pitch-deck/`, then run:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5188/`. All 57 slides are present. Autoplay starts on page load at five seconds per slide, with visible pause, duration, replay, and motion controls. Manual navigation and dialogs pause playback.

## Build and deployment

Set `SITE_URL` to the real production HTTP(S) origin in your shell or CI environment before building. The content generator reads `process.env`; adding a value to a Vite `.env` file alone does not set it for this Node script.

PowerShell:

```powershell
$env:SITE_URL = 'https://your-deck-domain.example'
npm run build
```

macOS/Linux:

```sh
SITE_URL=https://your-deck-domain.example npm run build
```

Deploy the resulting `dist/` directory to a static HTTP(S) host. The included build uses local preview URLs in its AI/canonical exports; rebuild with the actual production origin before publishing.

The app currently expects domain-root hosting, such as `https://deck.example.com/`. A subfolder deployment needs changes to both Vite's base and the root-relative asset/fetch/reader paths. Preserve directory-index handling for `/read/` before any SPA fallback, so the static reader is served instead of the viewer. `/read/index.html` is also a direct reader entry point.

For a local production preview, stop the dev server and run `npm run preview`. Both use port 5188 with strict port checking. To run them together, use `npm run preview -- --port 5190`. Requests bind to localhost by default; add `--host 0.0.0.0` only when you need a LAN/device preview.

## Files to know

- `src/main.tsx`: viewer, navigation, dialogs, and autoplay.
- `src/MotionArtwork.tsx`, `src/motion.css`: visible text layers and animation choreography.
- `src/styles.css`: viewer layout and responsive styles.
- `public/deck.json`: slide titles, ordering, source page mapping, and extracted copy.
- `public/motion.json`: active cropped text assets and source-coordinate placement.
- `public/assets/`: 57 slide images, thumbnails, 347 real text layers, backgrounds, fonts, logo, and the compact 57-page PDF.
- `public/read/`, `public/data/`, Markdown and `llms` files: static reader and machine-readable formats.
- `scripts/prepare_ai.mjs`: regenerates readable/AI exports automatically before dev/build.
- `design/SOURCE.md` and `design/VERIFICATION.md`: provenance, fidelity, and verification limits.
- `design/motion-refresh/motion-preview.webm`: short preview of the actual five-second autoplay.

## Optional checks

With the local dev server running in another terminal:

```sh
npx playwright install chromium
npm run check:motion
npm run check:reader
```

The tests use an isolated browser. Motion checks cover visible pixel content, headline reveals, settled geometry, replay, reverse navigation, reduced motion, failed-layer fallback, and phone layouts. Reader checks cover ten screen sizes with JavaScript disabled and preserve all 57 text records. Physical mobile devices and native fullscreen are subject to the limits recorded in the verification report.

## Updating the original slide artwork

All runtime assets are included, so Python and the original Figma PDF are unnecessary for normal development and deployment. To regenerate artwork later, export the original Figma frames as a high-quality PDF and use the Python commands in `design/SOURCE.md` with `scripts/requirements.txt` installed.

The original 463 MB, 58-page Figma export is not bundled. The included compact 57-page PDF is for distribution and is not a replacement input for the artwork pipeline. The source export contains one incidental 1 × 1 page that the scripts exclude. The Figma source link is recorded in the source documentation and slide manifest.

`node_modules/`, dependency junctions, caches, obsolete empty SVG exports, and intermediate debug images are omitted. The dependency lockfile uses registry packages with no machine-specific dependency links.
