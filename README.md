# Orbix studio deck

A responsive React and TypeScript viewer for the original Orbix pitch deck. Slide artwork, copy, ordering, and section names are supplied by `public/deck.json`; original full-slide images, thumbnails, fonts, logo, and downloadable PDF live in `public/assets`.

```sh
npm install
npm run dev
npm run build
npm run preview
```

The viewer supports slide links (`#slide-1`), browser history, previous/next navigation, an overview searchable by original slide text, focus mode, fullscreen, original text access, and touch swiping. Use arrow keys, Space, Home, and End to navigate; F toggles focus mode. Escape closes dialogs and exits focus mode.

Slides use different entrances for covers, large statements, editorial layouts, cards, and image-led pages. Headlines reveal through a mask, supporting copy arrives from its side of the layout, and card groups follow their reading order. Navigation follows the direction of travel. Text settles within 1.5 seconds; artwork settles within 2.6 seconds, leaving reading time in the five-second default interval. **Replay slide animation** restarts the current entrance; the sparkle control toggles motion. Reduced motion follows live operating system preference changes and displays static original slides. `public/motion.json` supplies cropped transparent lossless text images and backgrounds with their visible text outlines removed. Each layer's `frame` records its original source coordinates. Adjacent slide assets preload at low priority. All layers load before the entrance begins; an asset failure shows the original artwork and a notice.

Autoplay starts when the page opens, with 5 seconds per slide. The duration menu also offers 8 or 12 seconds per slide; a subtle progress line shows the current timer. Timing waits until the current artwork has loaded. Playback pauses after manual navigation, opening overview, text, or the duration menu, replaying or toggling motion, or hiding the browser tab. Focus mode can continue playing. The slideshow stops at the final slide and never wraps; paused playback remains off until **Play slides** is pressed again or the page is reopened.

The frontend expects this manifest shape:

```ts
{ title: string; sourceUrl: string; slides: Array<{
  id: number; title: string; section: string;
  image: string; thumbnail: string;
  width: number; height: number; text: string;
}> }
```

Local development and build output only; no production deployment is configured.

The viewer and preview default to `http://127.0.0.1:5188/`.

## Readable content and AI access

The complete deck is available without running JavaScript:

- `/read/` — readable HTML with all 57 slides and stable `#slide-N` anchors.
- `/data/deck.json` — source text, slide metadata, section groups, and stable URLs.
- `/data/deck.schema.json` — the JSON Schema for integrations.
- `/deck.md` and `/llms-full.txt` — the full source copy in text form.
- `/llms.txt` — concise index pointing AI readers to the useful formats.

The viewer and reader advertise alternate formats and include presentation JSON-LD. Robots and sitemap files expose the two human-readable entry points. Eleven artwork-only slides are explicitly marked; text inside raster artwork is not invented or inferred.

`npm run prepare:content` rebuilds these files directly from `public/deck.json`. It runs automatically before development and production builds, keeping the formats synchronized.

When building for a deployed host, set `SITE_URL` to that host's actual HTTP(S) origin first. The generator accepts root-domain hosting and rejects base paths, credentials, queries, or fragments. For example, in PowerShell:

```powershell
$env:SITE_URL = 'https://your-deck-domain.example'
npm run build
```

This generates deployment links; it does not publish the app. Without `SITE_URL`, exports use the local preview origin.

## Reader responsive checks

With the local preview running, run `npx playwright install chromium` once after installing dependencies, then `npm run check:reader`. The check opens an isolated Chromium browser with JavaScript disabled, covers ten phone/tablet/desktop sizes, checks all 57 source-text records, section anchors, artwork fit, horizontal overflow, and mobile navigation targets. Screenshots and results are written to `design/reader-check/`. Set `READER_TEST_URL` to check another local preview origin.

`npm run check:motion` verifies rendered entrances and settled geometry on representative compositions, actual painted text pixels, replay, reverse navigation, mobile layout, reduced motion, and an intentionally failed layer. Captures and results are written to `design/motion-refresh/`.
