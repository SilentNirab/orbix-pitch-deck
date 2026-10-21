"""Separate the original deck's visible PDF outline text into animatable layers.

The source PDF and existing slide assets are read only. Backgrounds remove exact
original glyph subpaths while retaining artwork.
Transparent cropped layers rasterize those source outlines with their original
transforms, gradients, masks, colors, and clipping.
"""

import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import time

import pymupdf
from PIL import Image, ImageChops
import numpy as np


IDENTITY = (1, 0, 0, 1, 0, 0)
PATH_OPERATORS = {"m", "l", "c", "v", "y", "h", "re"}
PAINT_OPERATORS = {"f", "F", "f*", "S", "s", "B", "B*", "b", "b*"}


def multiply(left, right):
    a, b, c, d, e, f = left
    g, h, i, j, k, l = right
    return (a*g+c*h, b*g+d*h, a*i+c*j, b*i+d*j,
            a*k+c*l+e, b*k+d*l+f)


def text_groups(page):
    flags = pymupdf.TEXTFLAGS_RAWDICT & ~pymupdf.TEXT_PRESERVE_IMAGES
    blocks = [block for block in page.get_text("rawdict", flags=flags)["blocks"] if block["type"] == 0]
    groups = []
    for block in blocks:
        lines = block["lines"]
        # A single PDF block can contain all three widely separated card numbers.
        chunks = []
        for line in lines:
            if chunks and line["bbox"][1] - chunks[-1][-1]["bbox"][3] < 70:
                chunks[-1].append(line)
            else:
                chunks.append([line])
        for chunk in chunks:
            spans = [span for line in chunk for span in line["spans"]]
            chars = [char for span in spans for char in span["chars"]]
            if not chars:
                continue
            bbox = (min(line["bbox"][0] for line in chunk), min(line["bbox"][1] for line in chunk),
                    max(line["bbox"][2] for line in chunk), max(line["bbox"][3] for line in chunk))
            size = max(span["size"] for span in spans)
            kind = "heading" if size >= 60 else "body"
            if bbox[1] < 100 or bbox[1] > page.rect.height - 110:
                kind = "label" if bbox[1] < 100 else "footer"
            groups.append({"bbox": bbox, "size": size, "kind": kind, "chars": chars})
    # Merge nearby copy/card fragments when the source has many small text blocks.
    while len(groups) > 10:
        choices = []
        for i, first in enumerate(groups):
            for j in range(i + 1, len(groups)):
                second = groups[j]
                a, b = first["bbox"], second["bbox"]
                dx = max(a[0]-b[2], b[0]-a[2], 0)
                dy = max(a[1]-b[3], b[1]-a[3], 0)
                penalty = 500 if first["kind"] != second["kind"] else 0
                choices.append((dx + dy * 1.3 + penalty, i, j))
        _, i, j = min(choices)
        first, second = groups[i], groups[j]
        a, b = first["bbox"], second["bbox"]
        first["bbox"] = (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
        first["chars"].extend(second["chars"])
        if second["size"] > first["size"]:
            first["kind"] = second["kind"]
            first["size"] = second["size"]
        groups.pop(j)
    return groups


def source_paint_plans(document, page, groups):
    """Associate exact Figma outline subpaths with semantic glyph baselines.

    Figma's visible letters are compound paths in the artifact Form XObject.
    Its Type3 text operators contain metadata only. Each visible glyph begins
    with a zero-area `x y m h` baseline marker, followed by its original outline.
    Keep every contour until the next marker, including counters and gradients.
    """
    chars = [(char["origin"][0], char["origin"][1], index)
             for index, group in enumerate(groups) for char in group["chars"]]
    grid = defaultdict(list)
    for x, y, index in chars:
        grid[(round(x), round(y))].append((x, y, index))
    objects = {(owner or page.xref, name): xref
               for xref, name, owner, _ in page.get_xobjects()}
    plans = {}
    anchors = defaultdict(int)
    distances = []

    def partition(path, matrix):
        markers = []
        for number, line in enumerate(path[:-1]):
            values = line.split()
            if values[-1:] != ["m"] or path[number + 1].strip() != "h":
                continue
            x, y = map(float, values[:2])
            a, b, c, d, e, f = matrix
            x, y = a*x+c*y+e, page.rect.height-(b*x+d*y+f)
            candidates = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    candidates.extend(grid.get((round(x)+dx, round(y)+dy), []))
            if not candidates:
                continue
            nearest = min(candidates, key=lambda item: (item[0]-x)**2+(item[1]-y)**2)
            distance = math.hypot(nearest[0]-x, nearest[1]-y)
            if distance <= 1:
                markers.append((number, nearest[2]))
                anchors[nearest[2]] += 1
                distances.append(distance)
        if not markers:
            return [(None, "".join(path))]
        parts = [(None, "".join(path[:markers[0][0]]))] if markers[0][0] else []
        for number, (offset, group) in enumerate(markers):
            end = markers[number + 1][0] if number + 1 < len(markers) else len(path)
            parts.append((group, "".join(path[offset:end])))
        return parts

    def visit(xref, owner, matrix, ancestors=()):
        if xref in ancestors:
            raise ValueError("Cyclic source Form XObject")
        key, value = document.xref_get_key(owner, "Matrix")
        if owner == xref and key == "array":
            numbers = [float(item) for item in value.strip("[]").split()]
            matrix = multiply(matrix, tuple(numbers))
        lines = document.xref_stream(xref).decode("latin-1").splitlines(keepends=True)
        commands = []
        pending = []
        stack = []
        path_matrix = matrix
        for line in lines:
            values = line.split()
            operator = values[-1] if values else ""
            if operator in PATH_OPERATORS:
                if not pending:
                    path_matrix = matrix
                pending.append(line)
                continue
            if operator in PAINT_OPERATORS:
                commands.append(("paint", partition(pending, path_matrix), line))
                pending = []
                continue
            if pending:
                # Clipping paths and path-discard operators retain their exact
                # source state; text is painted with fill/pattern operations.
                if operator in ("W", "W*") and any(group is not None for group, _ in partition(pending, path_matrix)):
                    raise ValueError("Unexpected glyph clipping path in source PDF")
                commands.append("".join(pending))
                pending = []
            if operator == "q":
                stack.append(matrix)
            elif operator == "Q":
                matrix = stack.pop()
            elif operator == "cm":
                matrix = multiply(matrix, tuple(map(float, values[:6])))
            elif operator == "Do":
                child = objects.get((owner, values[0].lstrip("/")))
                if child:
                    visit(child, child, matrix, (*ancestors, xref))
                commands.append(("object", child, line))
                continue
            commands.append(line)
        if pending:
            commands.append("".join(pending))
        if stack:
            raise ValueError("Unbalanced source graphics state")
        if xref in plans and plans[xref] != commands:
            raise ValueError("Reused source Form has different text geometry")
        plans[xref] = commands

    for xref in page.get_contents():
        visit(xref, page.xref, IDENTITY)
    return plans, anchors, max(distances, default=0)


def filtered_stream(commands, group, include_artwork=False):
    output = []
    for command in commands:
        if isinstance(command, str):
            output.append(command)
        elif command[0] == "object":
            # Layer documents keep nested Form state but suppress standalone
            # artwork images. Pattern and soft-mask resources stay untouched.
            if group is None or include_artwork or command[1] is not None:
                output.append(command[2])
        else:
            selected = "".join(path for owner, path in command[1]
                               if owner == group or (include_artwork and owner is None))
            output.append(selected + command[2] if selected else "n\n")
    return "".join(output).encode("latin-1")


def render(page, width=2400, alpha=False):
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(width/page.rect.width, width/page.rect.width), alpha=alpha)
    if not alpha:
        return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    # MuPDF exposes premultiplied alpha; lossless WebP and Pillow use straight
    # alpha. Unpremultiply the exact rendered outline coverage before encoding.
    pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 4).copy()
    coverage = pixels[:, :, 3:4].astype(np.float32)
    pixels[:, :, :3] = np.clip(np.rint(pixels[:, :, :3].astype(np.float32)*255/np.maximum(coverage, 1)), 0, 255).astype(np.uint8)
    return Image.fromarray(pixels, "RGBA")


def visible_contribution(background, selected, source_alpha):
    """Keep only a group's actual source contribution after artwork occlusion.

    Both RGB renders include every original nontext paint operation. Their
    difference therefore identifies exact visible glyph pixels, including
    foreground images and soft masks. Solve straight RGBA against that source
    background, retaining native outline alpha wherever the color allows it.
    """
    base = np.asarray(background).astype(np.float32)
    target = np.asarray(selected).astype(np.float32)
    delta = target - base
    visible = np.any(delta != 0, axis=2)
    minimum = np.max(np.where(delta >= 0, delta/np.maximum(255-base, 1),
                              -delta/np.maximum(base, 1)), axis=2)
    alpha = np.maximum(np.asarray(source_alpha), np.ceil(minimum*255)).clip(0, 255)
    alpha[~visible] = 0
    fraction = np.maximum(alpha[:, :, None], 1)/255
    color = (target-base)/fraction+base
    pixels = np.empty((*alpha.shape, 4), dtype=np.uint8)
    pixels[:, :, :3] = np.clip(np.rint(color), 0, 255).astype(np.uint8)
    pixels[:, :, 3] = alpha.astype(np.uint8)
    return Image.fromarray(pixels, "RGBA")


def prepare_slide(document, slide, output, verify=False):
    page = document[slide["sourcePage"]-1]
    groups = text_groups(page)
    if not groups:
        return {"id": slide["id"], "background": slide["image"], "layers": [], "animated": False}, {"nativeGlyphs": 0, "layers": 0, "unmatchedGlyphs": 0}
    started = time.monotonic()
    plans, anchors, max_distance = source_paint_plans(document, page, groups)
    originals = {xref: document.xref_stream(xref) for xref in plans}
    original_artwork = render(page)
    directory = output / f"{slide['id']:02d}"
    directory.mkdir(parents=True, exist_ok=True)
    layers = []
    details = []
    skipped = []
    exported_groups = []
    scale = 2400 / page.rect.width

    def apply(group, include_artwork=False):
        nonlocal page
        for xref, commands in plans.items():
            document.update_stream(xref, filtered_stream(commands, group, include_artwork))
        page = document.reload_page(page)

    try:
        apply(None)
        artwork = render(page)
        artwork.save(directory / "background.webp", "WEBP", quality=91, method=6)
        composite = artwork.convert("RGBA")
        order = sorted(range(len(groups)), key=lambda i: (
            groups[i]["kind"] in ("label", "footer"),
            round(groups[i]["bbox"][1] / 100), groups[i]["bbox"][0]))
        for index in order:
            if not anchors[index]:
                skipped.append({"group": index, "bbox": list(groups[index]["bbox"]),
                                "reason": "No direct source outline anchors; original artwork retained."})
                continue
            apply(index)
            image = render(page, alpha=True)
            alpha = image.getchannel("A")
            bbox = alpha.getbbox()
            if not bbox:
                skipped.append({"group": index, "bbox": list(groups[index]["bbox"]),
                                "reason": "Source outlines are fully clipped and paint no visible pixels."})
                continue
            painted_pixels = int(np.count_nonzero(np.asarray(alpha)))
            bbox = (max(0, bbox[0]-3), max(0, bbox[1]-3), min(image.width, bbox[2]+3), min(image.height, bbox[3]+3))
            cropped = image.crop(bbox)
            path = directory / f"text-{len(layers)+1:02d}.webp"
            cropped.save(path, "WEBP", lossless=True, method=6)
            delay = round(0.12 + min(len(layers), 8) * 0.075, 3)
            group = groups[index]
            layers.append({"src": f"/assets/motion/{directory.name}/{path.name}", "delay": delay,
                           "kind": group["kind"], "bounds": list(group["bbox"]),
                           "frame": [value / scale for value in bbox]})
            details.append({"sourceAnchors": anchors[index], "bbox": list(group["bbox"]),
                            "frame": [value / scale for value in bbox], "kind": group["kind"],
                            "paintedPixels": painted_pixels, "bytes": path.stat().st_size})
            exported_groups.append((index, bbox))
            composite.alpha_composite(cropped, dest=bbox[:2])
        difference = np.asarray(ImageChops.difference(original_artwork, composite.convert("RGB")))
        before_occlusion = round(float(difference.mean()), 5)
        if np.any(difference.max(axis=2) > 16):
            composite = artwork.convert("RGBA")
            repaired_layers = []
            repaired_details = []
            for number, ((index, old_bbox), layer, detail) in enumerate(zip(exported_groups, layers, details)):
                path = directory / f"text-{number+1:02d}.webp"
                source_alpha = Image.new("L", artwork.size)
                with Image.open(path) as existing:
                    source_alpha.paste(existing.getchannel("A"), old_bbox[:2])
                apply(index, include_artwork=True)
                image = visible_contribution(artwork, render(page), source_alpha)
                alpha = image.getchannel("A")
                bbox = alpha.getbbox()
                if not bbox:
                    skipped.append({"group": index, "bbox": list(groups[index]["bbox"]),
                                    "reason": "Source outlines are completely occluded by foreground artwork."})
                    continue
                bbox = (max(0, bbox[0]-3), max(0, bbox[1]-3), min(image.width, bbox[2]+3), min(image.height, bbox[3]+3))
                cropped = image.crop(bbox)
                path = directory / f"text-{len(repaired_layers)+1:02d}.webp"
                cropped.save(path, "WEBP", lossless=True, method=6)
                layer["src"] = f"/assets/motion/{directory.name}/{path.name}"
                layer["frame"] = [value / scale for value in bbox]
                detail.update({"frame": layer["frame"], "paintedPixels": int(np.count_nonzero(np.asarray(alpha))),
                               "bytes": path.stat().st_size, "occlusionResolved": True})
                repaired_layers.append(layer)
                repaired_details.append(detail)
                composite.alpha_composite(cropped, dest=bbox[:2])
            layers = repaired_layers
            details = repaired_details
            difference = np.asarray(ImageChops.difference(original_artwork, composite.convert("RGB")))
        report = {"nativeGlyphs": sum(len(group["chars"]) for group in groups), "layers": len(layers),
                  "sourcePaintAnchors": sum(anchors.values()), "maxAnchorDistance": round(max_distance, 5),
                  "unmatchedGlyphs": 0, "layerDetails": details,
                  "skippedGroups": skipped,
                  "nativeErrorBeforeOcclusion": before_occlusion,
                  "backgroundBytes": (directory / "background.webp").stat().st_size,
                  "extractionSeconds": round(time.monotonic()-started, 2)}
        if verify:
            removal = np.asarray(ImageChops.difference(original_artwork, artwork))
            report["verification"] = {"meanAbsoluteChannelError": round(float(difference.mean()), 5),
                                      "pixelFractionOver16": round(float((difference.max(axis=2)>16).mean()), 7),
                                      "backgroundRemovedPixels": int(np.count_nonzero(removal.max(axis=2)>16)),
                                      "size": list(composite.size)}
    finally:
        for xref, data in originals.items():
            document.update_stream(xref, data)
        document.reload_page(page)
    return {"id": slide["id"], "background": f"/assets/motion/{directory.name}/background.webp" if layers else slide["image"],
            "layers": layers, "animated": bool(layers)}, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--slides", type=int, nargs="*", help="Generate only these slide IDs")
    parser.add_argument("--verify", action="store_true", help="Compare separated source paint against the original PDF")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    deck = json.loads((root / "public" / "deck.json").read_text(encoding="utf-8"))
    output = root / "public" / "assets" / "motion"
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = root / "public" / "motion.json"
    report_path = root / "design" / "motion-assets-report.json"
    existing = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"slides": []}
    reports = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {"slides": []}
    prepared = {slide["id"]: slide for slide in existing["slides"]}
    checks = {slide["id"]: slide for slide in reports["slides"]}
    with pymupdf.open(args.pdf) as document:
        for slide in deck["slides"]:
            if args.slides and slide["id"] not in args.slides:
                continue
            started = time.monotonic()
            result, report = prepare_slide(document, slide, output, verify=args.verify)
            prepared[slide["id"]] = result
            checks[slide["id"]] = {"id": slide["id"], "sourcePage": slide["sourcePage"], **report}
            manifest_path.write_text(json.dumps({"slides": [prepared[key] for key in sorted(prepared)]}, indent=2), encoding="utf-8")
            report_path.write_text(json.dumps({"slides": [checks[key] for key in sorted(checks)]}, indent=2), encoding="utf-8")
            print(f"Slide {slide['id']:02d}: {len(result['layers'])} exact text layers; "
                  f"{report['unmatchedGlyphs']} unmatched; {time.monotonic()-started:.1f}s; {report.get('verification', {})}", flush=True)


if __name__ == "__main__":
    main()
