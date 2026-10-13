#!/usr/bin/env python3
"""Generate Folio's app icon and wordmark SVGs by outlining Fraunces Black glyphs.

The SVGs contain only paths (no <text>), so they render identically without the font.
The overlap of the two inks is a separately filled clip region, not a blend mode.

Usage:  python3 scripts/icon/build-icon.py
Needs:  fontTools with brotli (pip3 install fonttools brotli), and `npm install` (for the font).
Writes: src-tauri/icons/source/folio-icon.svg, docs/assets/folio-wordmark.svg, docs/assets/folio-wordmark-dark.svg
Then rasterize the 512px icon:
  rsvg-convert -w 512 -h 512 src-tauri/icons/source/folio-icon.svg -o docs/assets/folio-icon-512.png
"""
import argparse
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2"

BLUE = "#1b2a6b"
CORAL = "#ff5a4e"
OVERLAP = "#1b0f21"  # multiply(BLUE, CORAL)
PAPER = "#f6efe2"
PAPER_EDGE = "#e2d6c2"

# Coral ink sits this far right/down of the blue ink, as a fraction of the glyph height.
OFFSET_X = 28 / 600
OFFSET_Y = 22 / 600


def load_font() -> TTFont:
    font = TTFont(FONT)
    axes = {axis.axisTag for axis in font["fvar"].axes}
    wanted = {"wght": 900, "opsz": 144, "SOFT": 0, "WONK": 0}
    return instantiateVariableFont(font, {tag: value for tag, value in wanted.items() if tag in axes})


def glyph_run(font: TTFont, text: str, tracking_em: float = 0.0) -> list[tuple[str, float]]:
    """Glyph names with their x positions in font units (advance widths plus tracking; no kerning)."""
    cmap, hmtx, upm = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
    x, run = 0.0, []
    for ch in text:
        name = cmap[ord(ch)]
        run.append((name, x))
        x += hmtx[name][0] + tracking_em * upm
    return run


def run_bounds(font: TTFont, run) -> tuple[float, float, float, float]:
    glyphs = font.getGlyphSet()
    pen = BoundsPen(glyphs)
    for name, x in run:
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
    return pen.bounds


def run_path(font: TTFont, run, scale: float, tx: float, ty: float) -> str:
    """SVG path data for the run, scaled and flipped into SVG's y-down space."""
    glyphs = font.getGlyphSet()
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    for name, x in run:
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, tx + x * scale, ty)))
    return pen.getCommands()


def two_ink(font: TTFont, run, height: float, left: float, top: float) -> tuple[str, str, float, float]:
    """Blue and coral paths for a run whose ink box is `height` tall at (left, top). Returns (blue, coral, width, total_height)."""
    x_min, y_min, x_max, y_max = run_bounds(font, run)
    scale = height / (y_max - y_min)
    dx, dy = OFFSET_X * height, OFFSET_Y * height
    tx = left - x_min * scale
    ty = top + y_max * scale
    blue = run_path(font, run, scale, tx, ty)
    coral = run_path(font, run, scale, tx + dx, ty + dy)
    return blue, coral, (x_max - x_min) * scale + dx, height + dy


def inks(blue: str, coral: str, top_ink: str = BLUE, under_ink: str = CORAL, overlap_ink: str = OVERLAP) -> str:
    return (
        f'  <defs><clipPath id="coral-ink"><path d="{coral}"/></clipPath></defs>\n'
        f'  <path d="{coral}" fill="{under_ink}"/>\n'
        f'  <path d="{blue}" fill="{top_ink}"/>\n'
        f'  <path d="{blue}" fill="{overlap_ink}" clip-path="url(#coral-ink)"/>\n'
    )


def icon_svg(font: TTFont) -> str:
    run = glyph_run(font, "f")
    height = 600.0
    _, _, width, _ = two_ink(font, run, height, 0, 0)
    blue, coral, _, _ = two_ink(font, run, height, 512 - width / 2, 248)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n'
        f'  <rect x="100" y="100" width="824" height="824" rx="185" fill="{PAPER}"/>\n'
        f'  <rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="{PAPER_EDGE}" stroke-width="3"/>\n'
        + inks(blue, coral)
        + "</svg>\n"
    )


def wordmark_svg(font: TTFont, top_ink: str, under_ink: str, overlap_ink: str) -> str:
    run = glyph_run(font, "folio", tracking_em=-0.02)
    pad, height = 8.0, 160.0
    blue, coral, width, total = two_ink(font, run, height, pad, pad)
    w, h = round(width + 2 * pad), round(total + 2 * pad)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="folio">\n'
        + inks(blue, coral, top_ink, under_ink, overlap_ink)
        + "</svg>\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=ROOT, help="repo root to write into (default: this repo)")
    args = parser.parse_args()
    font = load_font()
    icon = args.out_dir / "src-tauri/icons/source/folio-icon.svg"
    wordmark = args.out_dir / "docs/assets/folio-wordmark.svg"
    wordmark_dark = args.out_dir / "docs/assets/folio-wordmark-dark.svg"
    for path, svg in (
        (icon, icon_svg(font)),
        (wordmark, wordmark_svg(font, BLUE, CORAL, OVERLAP)),
        (wordmark_dark, wordmark_svg(font, PAPER, CORAL, CORAL)),  # light top ink: the overlap reads coral
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(svg)
        print(f"wrote {path.relative_to(args.out_dir)}")


if __name__ == "__main__":
    main()
