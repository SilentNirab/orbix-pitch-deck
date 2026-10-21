"""Create a compact visual PDF for download from the optimized slide artwork.

The untouched high-quality Figma PDF remains the source. This portable copy
uses the same full-slide artwork as the web viewer and embeds searchable text.
"""

import argparse
import io
from pathlib import Path

import pymupdf
from PIL import Image
from fontTools.ttLib import TTFont


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    target = root / "public" / "assets" / "orbix-pitch-deck.pdf"
    source = pymupdf.open(args.source)
    pages = [page for page in source if page.rect.width > 100 and page.rect.height > 100]
    doc = pymupdf.open()
    font = TTFont(root / "public" / "assets" / "neue-montreal.woff2")
    font.flavor = None
    font_stream = io.BytesIO()
    font.save(font_stream)
    for i, original in enumerate(pages):
        artwork_path = root / "public" / "assets" / "slides" / f"{i + 1:02d}.webp"
        with Image.open(artwork_path) as artwork:
            encoded = io.BytesIO()
            artwork.convert("RGB").save(encoded, "JPEG", quality=93, optimize=True)
        page = doc.new_page(width=original.rect.width, height=original.rect.height)
        page.insert_image(page.rect, stream=encoded.getvalue())
        text = original.get_text().strip()
        if text:
            page.insert_font(fontname="OrbixText", fontbuffer=font_stream.getvalue())
            page.insert_text((8, 8), text, fontname="OrbixText", fontsize=2, render_mode=3)
    doc.set_metadata({"title": "Orbix Studio — Company Deck", "author": "Orbix Studio", "subject": "Complete studio introduction, selected work, services, and engagement"})
    doc.save(target, garbage=4, deflate=True)
    result = pymupdf.open(target)
    assert len(result) == len(doc), "Page count changed during optimization"
    assert all(result[i].rect == pages[i].rect for i in range(len(doc))), "Page geometry changed"
    print(f"Verified {len(result)} pages; {target.stat().st_size / 1024 / 1024:.1f} MB", flush=True)


if __name__ == "__main__":
    main()
