# Source and fidelity

The presentation comes from [Orbix Pitch Deck in Figma](https://www.figma.com/design/W5FZYbLVrkrIdSb3kwpL94/Branding---Graphical-Elements?node-id=961-3139).

The Figma connector returned a reauthentication error, including after reconnection. The signed-in Figma browser session provided the original PDF through **Export frames to PDF**, using sRGB and High quality. No screenshots of the editor are used in the application.

The original export remains at `C:\path\to\original-figma-export.pdf`. It contains 58 pages: 57 presentation frames at 1920 × 1080 and one incidental 1 × 1 canvas artifact at source page 37. The viewer excludes that artifact and preserves the source order. Each manifest entry records its original `sourcePage` for verification.

Full-slide artwork is rendered locally at 2400 × 1350, encoded as WebP, with 480 × 270 thumbnails. These originals remain available for static and reduced-motion display. Animated text comes from the source PDF's visible vector outlines, identified by their exact glyph-baseline markers. The PDF's Type3 semantic fonts contain empty drawing shapes; animating those alone has no visible result, so the initial SVG extraction was replaced. The corrected pipeline removes the corresponding visible outline paint from background Form streams and renders it separately as tightly cropped, transparent lossless WebP layers. Source coordinates in `frame` place each crop back at its original position. Rendering directly from the PDF retains gradients, masks, clipping, and source typography. Foreground occlusion is preserved using each group's visible contribution in the complete source composition. Source streams are restored after each render, and the original PDF is never saved or modified. Eleven artwork-only slides and the nested preview composition on slide 24 use an image entrance; their semantic copy remains available wherever the PDF supplies it. Text inside raster mockups or unseparated nested pattern artwork stays in its original image. The viewer provides replay and motion controls; the Zoom feature was removed at the user's request.

The readable copy comes directly from the PDF text layer. The widely spaced recurring “Product × Design × Growth” tagline is normalized for readability and search. Eleven portfolio pages are artwork-only; their small embedded interface text is preserved visually but has no extractable PDF text layer. Titles and section labels describe the original content without changing the slide artwork or its claims.

The logo and Neue Montreal fonts were downloaded from the public assets used by [orbix.studio](https://www.orbix.studio/). The viewer uses those same fonts, black rounded controls, and a soft neutral background.

The 17 MB downloadable PDF is a portable visual copy made from the same original slide artwork, with the source text embedded invisibly using the supplied Neue Montreal font. Its page count, dimensions, image encoding, and normalized text are verified against the source. The original high-quality Figma export is untouched.

To regenerate assets:

```powershell
python -m pip install -r scripts/requirements.txt
python scripts/prepare_deck.py 'C:\path\to\original-figma-export.pdf'
python scripts/optimize_pdf.py 'C:\path\to\original-figma-export.pdf'
python scripts/prepare_motion.py 'C:\path\to\original-figma-export.pdf' --verify
python scripts/verify_motion.py 'C:\path\to\original-figma-export.pdf'
```

If the Figma deck changes, review the slide titles, sections, and source page count before rebuilding.

The AI-readable JSON, Markdown, presentation JSON-LD, and static HTML reader are generated directly from `public/deck.json` by `npm run prepare:content`, also run automatically before development and production builds. They retain the same extracted copy and source page mapping, and explicitly identify artwork-only slides. `llms.txt`, robots, and sitemap files link to these formats. Set `SITE_URL` to the actual deployed origin when publishing; the default links target the local preview.
