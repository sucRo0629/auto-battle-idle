#!/usr/bin/env python3
"""Generate transparent HUD class icon PNGs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src" / "assets" / "class-icons"
BASE_SIZE = 32
# Matches HUD_ICON_SIZE in src/render/BattleCanvas.ts
SIZE = 24


def scale(value: int) -> int:
    return round(value * SIZE / BASE_SIZE)


def put_rect(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    color: tuple[int, int, int, int],
) -> None:
    draw.rectangle(
        (scale(x), scale(y), scale(x + w - 1), scale(y + h - 1)),
        fill=color,
    )


def draw_badge(
    image: Image.Image,
    bg: tuple[int, int, int, int],
    symbol: tuple[int, int, int, int],
    draw_symbol,
) -> None:
    draw = ImageDraw.Draw(image)
    draw.ellipse((scale(2), scale(2), scale(29), scale(29)), fill=bg)
    draw_symbol(draw, symbol)


def icon_defender(draw: ImageDraw.ImageDraw, color: tuple[int, int, int, int]) -> None:
    put_rect(draw, 14, 8, 4, 10, color)
    put_rect(draw, 10, 12, 12, 8, color)
    put_rect(draw, 12, 20, 8, 4, color)


def icon_attacker_melee(draw: ImageDraw.ImageDraw, color: tuple[int, int, int, int]) -> None:
    put_rect(draw, 15, 7, 2, 14, color)
    put_rect(draw, 11, 7, 10, 3, color)
    put_rect(draw, 10, 10, 3, 8, color)


def icon_supporter(draw: ImageDraw.ImageDraw, color: tuple[int, int, int, int]) -> None:
    put_rect(draw, 14, 8, 4, 14, color)
    put_rect(draw, 10, 12, 12, 4, color)


def icon_attacker_ranged(draw: ImageDraw.ImageDraw, color: tuple[int, int, int, int]) -> None:
    put_rect(draw, 8, 14, 12, 2, color)
    put_rect(draw, 18, 12, 2, 6, color)
    put_rect(draw, 20, 13, 4, 2, color)
    put_rect(draw, 20, 15, 2, 2, color)


ICONS = {
    "defender_placeholder": ("#2c5f9e", icon_defender),
    "attacker_melee_placeholder": ("#c0392b", icon_attacker_melee),
    "supporter_placeholder": ("#1e8449", icon_supporter),
    "attacker_ranged_placeholder": ("#922b21", icon_attacker_ranged),
}


def parse_color(value: str) -> tuple[int, int, int, int]:
    hex_value = value.lstrip("#")
    return (
        int(hex_value[0:2], 16),
        int(hex_value[2:4], 16),
        int(hex_value[4:6], 16),
        255,
    )


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    white = (236, 240, 241, 255)

    for name, (bg_hex, draw_symbol) in ICONS.items():
        image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        draw_badge(image, parse_color(bg_hex), white, draw_symbol)
        out = ICON_DIR / f"{name}.png"
        image.save(out, format="PNG")
        print(f"Wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
