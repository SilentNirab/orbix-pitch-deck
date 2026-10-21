"""Compare the settled motion layers against the original Figma PDF artwork."""

import argparse
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageStat


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    deck = json.loads((root / "public" / "deck.json").read_text(encoding="utf-8"))
    motion = json.loads((root / "public" / "motion.json").read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in motion["slides"]}
    results = []
    with pymupdf.open(args.source) as source:
        for slide in deck["slides"]:
            spec = by_id[slide["id"]]
            if not spec["animated"]:
                continue
            page = source[slide["sourcePage"] - 1]
            scale = 2400 / page.rect.width
            original_pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
            original = Image.frombytes("RGB", (original_pix.width, original_pix.height), original_pix.samples)
            background = root / "public" / spec["background"].lstrip("/")
            with Image.open(background) as image:
                composite = image.convert("RGBA")
            if composite.size != original.size:
                raise ValueError(f"Slide {slide['id']} background has different geometry")
            background_difference = ImageChops.difference(original, composite.convert("RGB")).convert("L")
            paint_checks = []
            for layer in spec["layers"]:
                layer_path = root / "public" / layer["src"].lstrip("/")
                if layer_path.suffix == ".svg":
                    with pymupdf.open(layer_path) as svg:
                        pix = svg[0].get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=True)
                    artwork = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
                    left, top = 0, 0
                else:
                    with Image.open(layer_path) as image:
                        artwork = image.convert("RGBA")
                    frame = layer["frame"]
                    left, top, right, bottom = [round(value * scale) for value in frame]
                    if artwork.size != (right - left, bottom - top):
                        raise ValueError(f"Slide {slide['id']} cropped layer geometry does not match frame")
                mask = artwork.getchannel("A").point(lambda alpha: 255 if alpha > 16 else 0)
                painted = mask.histogram()[255]
                if not painted:
                    raise ValueError(f"Slide {slide['id']} has an invisible text layer: {layer_path.name}")
                delta = background_difference.crop((left, top, left + artwork.width, top + artwork.height))
                removed = ImageChops.multiply(delta.point(lambda value: 255 if value > 8 else 0), mask).histogram()[255]
                if removed == 0:
                    raise ValueError(f"Slide {slide['id']} text remains baked into its background: {layer_path.name}")
                paint_checks.append({"src": layer["src"], "paintedPixels": painted, "backgroundInkChangedPixels": removed})
                composite.alpha_composite(artwork, dest=(left, top))
            difference = ImageChops.difference(original, composite.convert("RGB"))
            mean_error = sum(ImageStat.Stat(difference).mean) / 3
            results.append({"id": slide["id"], "layers": len(spec["layers"]), "meanRgbError": round(mean_error, 4), "paintChecks": paint_checks})
            print(f"Slide {slide['id']:02d}: {len(spec['layers'])} layers, mean RGB error {mean_error:.3f}", flush=True)
            if mean_error > 3:
                composite.convert("RGB").save(root / "design" / f"motion-check-{slide['id']:02d}.png")
                difference.save(root / "design" / f"motion-diff-{slide['id']:02d}.png")
    report = {"comparison": "Native PDF versus settled background and separated visible text at 2400 x 1350; every layer has painted pixels and removed background ink", "slides": results}
    (root / "design" / "motion-comparison.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    warnings = [item for item in results if item["meanRgbError"] > 3]
    print(f"Compared {len(results)} animated slides; {len(warnings)} need visual review.", flush=True)


if __name__ == "__main__":
    main()
