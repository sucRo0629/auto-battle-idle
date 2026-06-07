#!/usr/bin/env python3
"""Convert simple rect-based SVG sprites to transparent PNG."""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPRITE_DIR = ROOT / "src" / "assets" / "sprites"
SIZE = 32

RECT_RE = re.compile(
    r'<rect\b([^>]*)/?>',
    re.IGNORECASE,
)

ATTR_RE = re.compile(r'(\w+)="([^"]*)"')

BACKGROUND_FILL = "#1a1a2e"


def parse_attrs(raw: str) -> dict[str, str]:
    return {key: value for key, value in ATTR_RE.findall(raw)}


def parse_color(value: str) -> tuple[int, int, int, int]:
    value = value.strip().lower()
    if value.startswith("#"):
        hex_value = value[1:]
        if len(hex_value) == 3:
            hex_value = "".join(ch * 2 for ch in hex_value)
        r = int(hex_value[0:2], 16)
        g = int(hex_value[2:4], 16)
        b = int(hex_value[4:6], 16)
        return (r, g, b, 255)
    raise ValueError(f"Unsupported color: {value}")


def is_background_rect(attrs: dict[str, str]) -> bool:
    if attrs.get("fill", "").lower() != BACKGROUND_FILL:
        return False
    width = int(attrs.get("width", "0"))
    height = int(attrs.get("height", "0"))
    x = int(attrs.get("x", "0"))
    y = int(attrs.get("y", "0"))
    return width == SIZE and height == SIZE and x == 0 and y == 0


def svg_to_png(svg_path: Path, png_path: Path) -> None:
    svg = svg_path.read_text(encoding="utf-8")
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    for match in RECT_RE.finditer(svg):
        attrs = parse_attrs(match.group(1))
        if "fill" not in attrs:
            continue
        if is_background_rect(attrs):
            continue

        x = int(attrs.get("x", "0"))
        y = int(attrs.get("y", "0"))
        width = int(attrs["width"])
        height = int(attrs["height"])
        color = parse_color(attrs["fill"])

        for py in range(y, y + height):
            for px in range(x, x + width):
                image.putpixel((px, py), color)

    image.save(png_path, format="PNG")


def main() -> None:
    for svg_path in sorted(SPRITE_DIR.glob("*.svg")):
        png_path = svg_path.with_suffix(".png")
        svg_to_png(svg_path, png_path)
        print(f"Wrote {png_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
