# Verification — 21 October 2026

## Build and assets

- `npm run build` passes TypeScript and Vite production compilation.
- All 118 slide, thumbnail, logo, font, and PDF URLs return HTTP 200 with non-empty content.
- Original Figma export has 57 full-size frames plus one incidental 1 × 1 artifact. The manifest preserves all 57 frames in source order and records the source page mapping.
- All 114 slide/thumbnail files exist at 2400 × 1350 and 480 × 270 respectively.
- Portable PDF has 57 pages at 1920 × 1080. Its whitespace-normalized text matches every corresponding source page, including Unicode punctuation. Sampled embedded artwork matches the expected encoding of the viewer artwork.
- Independent React and Python reviews completed. Functional and accessibility findings were corrected and rechecked.

## Browser acceptance

- Previous/next navigation, first/last bounds, arrow keys from focused controls, Home/End, browser history, and slide deep links work.
- Overview search finds original slide text; empty results and clearing search work.
- Read-slide dialog exposes original text and a keyboard-focusable scroll region. Cmd/Ctrl+K does not stack dialogs.
- Skip link focuses the viewer without changing the current slide.
- Focus mode preserves artwork proportions. The Zoom control and related application behavior were subsequently removed at the user's request.
- A fresh page load starts autoplay at five seconds per slide, including when deck data loads slowly. Browser verification confirmed automatic advance and a manual pause that holds beyond the next interval. Autoplay pauses on manual navigation and overview and stops at the final slide. React review confirmed timer cleanup, waiting for loaded artwork, image-error pause, and hidden-tab pause.
- Reduced-motion CSS disables animated entrances. Autoplay now starts by default, with a visible Pause control, at the user's request.
- Native fullscreen was denied by the automated browser environment; the visible failure notice and independent focus-mode fallback work.

## Responsive layouts

No horizontal overflow, with navigation and playback controls visible:

| Viewport | Footer bottom |
| --- | --- |
| 1366 × 768 | 763 px |
| 1536 × 864 | 859 px |
| 390 × 844 | 585 px |
| 320 × 568 | 546 px |
| 844 × 390, landscape | 382 px |
| 740 × 360, landscape | 352 px |

Landscape focus mode was also verified. Phone layouts include readable text for dense slides. Touch swipe is implemented with horizontal intent detection; physical touch hardware was not available for testing.

Captures: `preview-desktop.jpg` and `preview-mobile.jpg`.

## Text animation and timing-menu update

- The original SVG exports were retired after pixel inspection found their Type3 semantic glyph shapes were empty and the visible lettering remained in the background. Counting glyph references and matching a final composite alone had failed to detect this no-op decomposition.
- Corrected exports separate the source's visible outline paint into cropped transparent lossless WebPs, retaining exact glyph geometry, gradients, and clipping. Every emitted layer must have nonzero painted alpha, corresponding background ink must change, and the final composite is compared independently to the source PDF at 2400 × 1350. Source streams are restored in `finally`; the PDF on disk is never saved or modified.
- Covers, statements, editorial layouts, card grids, and image-led slides have distinct entrances. Headline masks, role-specific pacing, source-based transform origins, and direction-aware navigation replace the uniform small fade. All text settles within 1.5 seconds; all artwork settles within 2.6 seconds of the five-second interval.
- Browser checks assert actual painted text pixels, an initial text transform/opacity change, and fully visible, unclipped final text at its original coordinates. Replay restarts the entrance and pauses autoplay; Motion off displays the original static slide.
- Autoplay advances between layered slides and continues waiting for complete current-slide readiness. The new duration menu changes 5/8/12-second timing and pauses playback while open.
- Menu keyboard arrows, Tab continuation, Escape, radio semantics, and focus indicators were reviewed and corrected.
- Menu bounds and all controls fit at 390 × 844, 320 × 568, 844 × 390, and 1366 × 768. No horizontal overflow.
- Reduced-motion rendering is verified in an isolated Chromium context: original artwork is static with no text layers, transforms, or CSS animation. Live preference handling is also reviewed in code.

## Completed motion refresh

- Final manifest: 57 slides, 45 with 347 real cropped text layers, and 12 original-image entrances. Fifteen empty, fully clipped, or indirectly embedded semantic groups are skipped rather than exported as fake text layers. Slide 24 retains its complete original image and semantic reader copy.
- Active motion assets total 392 files / 4,947,880 bytes. All text WebPs use lossless RGBA encoding. Maximum decoded text per slide is 6.08 MiB; crop frames match bitmap dimensions exactly.
- Source-level reconstruction peaks at 0.0139 / 255 mean RGB error, with no pixel exceeding a channel error of 16. Collage/foreground occlusion is corrected from each text group's visible contribution, avoiding newly exposed hidden lettering.
- Independent verification opens every delivered layer, checks nonempty painted alpha and corresponding background ink removal, restores its crop at source coordinates, and compares every animated slide to the original PDF at 2400 × 1350. Delivered-image error peaks at 1.592 / 255 on photo collage slide 23, with no slide exceeding the visual-review threshold of 3.
- `npm run check:motion` passes seven representative compositions. Tests require a genuine initial text transform/opacity change and a clipped headline, real painted pixels, readable/unclipped text by 1.7 seconds, and fully settled geometry by 3 seconds. Replay, reverse navigation, Motion off, reduced motion, and a manifest-derived intentionally failed layer all pass.
- Updated mobile animation layouts fit at 320 × 568, 390 × 844, and 844 × 390 with all controls visible and no horizontal overflow. Chromium mobile emulation was used; physical devices were not available.
- `npm run build` passes. A nine-second recording confirms default five-second autoplay advances from slide 41 to 42 with the new layers, without pressing Play. Captures, results, and `motion-preview.webm` are saved in `design/motion-refresh/`.

## AI-readable content

- Production build regenerates eleven content and discovery files from the same `public/deck.json` used by the viewer. All 57 exported text values match the source manifest exactly; eleven artwork-only slides are explicitly labeled.
- The static reader contains 57 semantic articles, six sections, stable anchors, original artwork links, and no executable JavaScript. All 46 extracted-text blocks round-trip to the source copy. Desktop browser inspection confirmed the reader and its format links are visible.
- JSON, JSON Schema, presentation JSON-LD, Markdown aliases, `llms.txt`, `llms-full.txt`, robots, and sitemap files return HTTP 200 with appropriate content types. Viewer JSON-LD contains all 57 slide entries.
- Development and production-preview `/read/` routes, including a query string, serve the complete reader rather than the React fallback. Generated links and assets resolve.
- Repeated generation is byte-identical. Invalid `SITE_URL` values reject before writes. Independent TypeScript review found no remaining correctness or security issues.
- These exports currently use the local preview origin. Set the documented `SITE_URL` to the actual deployed origin when publishing; public crawlers cannot reach localhost.
- The initial browser-connection failure was resolved for reader QA by using an isolated Chromium test browser. Completed mobile checks are recorded below.

## Completed mobile reader check

- `npm run check:reader` passes all ten viewport sizes: 320 × 568, 360 × 640, 375 × 667, 390 × 844, 414 × 896, 568 × 320, 844 × 390, 768 × 1024, 1024 × 768, and 1440 × 900.
- Checks passed against both local development and the production build served through a temporary local Vite preview. Phone/tablet contexts use mobile viewport and touch emulation. JavaScript is disabled in every context; requested and rendered layout widths match.
- All 57 source-text records remain exact. All 57 artwork previews and six unique section links are present. Section navigation and back-to-top work, artwork fits, and neither the document nor its visible elements overflow horizontally.
- Mobile header spacing is corrected at 320 px and can wrap when necessary. Header, format, contents, and slide-resource links have at least 44 px target height. The single-slide section label now uses singular grammar.
- `npm run build` passes. Independent code and JavaScript reviews found no actionable issues. Testing uses Chromium emulation rather than physical mobile hardware.
- Screenshots and per-viewport results are saved in `design/reader-check/`; the script is repeatable after installing its declared Playwright development dependency and Chromium browser.
