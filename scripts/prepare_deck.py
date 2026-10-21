"""Prepare local, optimized presentation assets from the original Figma PDF export."""

import argparse
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

TITLES = [
    "Company deck", "What’s inside", "Ambitious digital experiences", "Our core proposition",
    "The problems we solve", "Better product experiences", "Our design process", "Why product-led design matters",
    "From design to development", "Strategy & research", "Brand systems", "Interface design", "UX architecture",
    "Product design & development", "Our full-cycle design process", "From discovery to optimization",
    "Detailed project workflow", "Growth without the chaos", "Measured impact", "Better workflows, stronger retention",
    "Performance metrics", "Selected work", "Tuccan — brand identity", "Bunbon — brand identity", "Koko — brand identity",
    "Mobile experiences · 01", "Mobile experiences · 02", "Mobile experiences · 03", "Mobile experiences · 04",
    "Product dashboards", "Web platforms", "Product platforms", "SaaS & enterprise platforms",
    "Website design", "Websites & digital experiences", "AI creative production", "Our story", "Mission & vision",
    "Our core values", "Product-first philosophy", "Our team structure", "Our product disciplines",
    "Departments & capabilities", "Remote & global collaboration", "How we structure engagements",
    "Ongoing product growth", "Product launch program", "Our collaboration framework", "Average project timelines",
    "Investment ranges", "What sets us apart", "Let’s build what matters", "Service pricing ranges",
    "Strategy & brand pricing", "Design & development pricing", "How we work", "Contact & next steps",
]


def section_for(number):
    for end, section in [(9, "Introduction"), (21, "Services & process"), (36, "Selected work"), (44, "Who we are"), (56, "Engagement & investment"), (57, "Next steps")]:
        if number <= end:
            return section
    raise ValueError(f"Unexpected slide number {number}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = root / "public" / "assets" / "slides"
    output.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(args.pdf)
    slides = []
    # Figma exports a stray 1 x 1 canvas artifact between the portfolio and studio story.
    pages = [(i, page) for i, page in enumerate(doc) if page.rect.width > 100 and page.rect.height > 100]
    assert len(pages) == len(TITLES), "The original deck changed; review slide titles and sections"
    sheet = Image.new("RGB", (1440, ((len(pages) + 3) // 4) * 230), "#e9e9e5")
    draw = ImageDraw.Draw(sheet)
    for i, (source_page, page) in enumerate(pages):
        number = i + 1
        pix = page.get_pixmap(matrix=pymupdf.Matrix(2400 / page.rect.width, 2400 / page.rect.width), alpha=False)
        artwork = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        image_path = output / f"{number:02d}.webp"
        artwork.save(image_path, "WEBP", quality=91, method=6)
        thumbnail = artwork.copy()
        thumbnail.thumbnail((480, 300))
        thumbnail.save(output / f"{number:02d}-thumb.webp", "WEBP", quality=80, method=4)
        sheet_thumb = artwork.copy()
        sheet_thumb.thumbnail((344, 194))
        x, y = (i % 4) * 360 + 8, (i // 4) * 230 + 8
        sheet.paste(sheet_thumb, (x, y))
        draw.text((x + 2, y + 199), f"{number:02d}", fill="#222222")
        text = page.get_text().strip()
        text = text.replace("P r o d u c t     x     D e s i g n     x     G r o w t h", "Product × Design × Growth")
        slides.append({"id": number, "sourcePage": source_page + 1, "title": TITLES[i], "section": section_for(number), "image": f"/assets/slides/{number:02d}.webp", "thumbnail": f"/assets/slides/{number:02d}-thumb.webp", "width": round(page.rect.width), "height": round(page.rect.height), "text": text})
        print(f"Prepared {number}/{len(pages)}: {round(page.rect.width)} x {round(page.rect.height)}, {len(text)} text characters", flush=True)
    sheet.save(root / "design" / "contact-sheet.jpg", quality=85)
    manifest = {"title": "Orbix Studio — Studio introduction", "sourceUrl": "https://www.figma.com/design/W5FZYbLVrkrIdSb3kwpL94/Branding---Graphical-Elements?node-id=961-3139", "slides": slides}
    (root / "public" / "deck.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Finished: {len(slides)} original slides", flush=True)


if __name__ == "__main__":
    main()
