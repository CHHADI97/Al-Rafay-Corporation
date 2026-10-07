#!/usr/bin/env python3
"""Prepare dealership imagery for the website.

Studio photos arrive as rectangular images on a plain (off-white to grey)
background. Instead of cut-outs we normalise the background to pure white so
the CSS `mix-blend-mode: multiply` trick makes the car float on any light
surface (the hero "showroom lane", white cards, etc.).

Outputs
  public/assets/img/cars/<slug>.webp   1400px wide - inventory cards + galleries
  public/assets/img/hero/<slug>.webp    900px wide - the animated hero lane

Usage: python3 tools/build_images.py [--source rawcars] [--only slug,slug]
"""
from __future__ import annotations

import argparse
import glob
import os
from collections import Counter
from statistics import median

from PIL import Image, ImageEnhance

CAR_WIDTH = 1400
HERO_WIDTH = 900
QUALITY = 78


def border_colour(im: Image.Image) -> tuple[int, int, int]:
    w, h = im.size
    px = im.convert('RGB').load()
    samples = []
    step = max(1, w // 60)
    for x in range(0, w, step):
        samples.append(px[x, 3])
        samples.append(px[x, h - 4])
    for y in range(0, h, step):
        samples.append(px[3, y])
        samples.append(px[w - 4, y])
    channels = []
    for index in range(3):
        channels.append(int(median([s[index] for s in samples])))
    return tuple(channels)  # type: ignore[return-value]


def normalise(im: Image.Image) -> Image.Image:
    """Scale the image so the studio background becomes pure white."""
    rgb = im.convert('RGB')
    bg = border_colour(rgb)
    lookup_builders = []
    for channel in range(3):
        scale = 255.0 / max(120, bg[channel])
        table = []
        for value in range(256):
            lifted = value * scale
            # gentle contrast lift keeps the car from looking washed out
            lifted = (lifted - 128) * 1.04 + 128
            table.append(max(0, min(255, int(round(lifted)))))
        lookup_builders.append(table)
    out = rgb
    for channel, table in enumerate(lookup_builders):
        band = out.getchannel(channel).point(table)
        out = Image.merge('RGB', [
            band if index == channel else out.getchannel(index)
            for index in range(3)
        ])
    return ImageEnhance.Color(out).enhance(1.04)


def save(im: Image.Image, path: str, width: int) -> int:
    if im.width > width:
        im = im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=QUALITY, method=5)
    return os.path.getsize(path)


def dominant_colour(im: Image.Image) -> str:
    small = im.convert('RGB').resize((60, 40))
    px = list(small.getdata())
    counts = Counter((r // 32, g // 32, b // 32) for r, g, b in px)
    (r, g, b), _ = counts.most_common(1)[0]
    return f'#{r * 32 + 16:02x}{g * 32 + 16:02x}{b * 32 + 16:02x}'


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default='rawcars')
    parser.add_argument('--only', default='')
    args = parser.parse_args()

    wanted = {slug.strip() for slug in args.only.split(',') if slug.strip()}
    sources = sorted(glob.glob(os.path.join(args.source, '*.png')) + glob.glob(os.path.join(args.source, '*.jpg')))
    rows = []
    for source in sources:
        slug = os.path.splitext(os.path.basename(source))[0]
        if slug.startswith('_') or (wanted and slug not in wanted):
            continue
        with Image.open(source) as raw:
            clean = normalise(raw)
            car_bytes = save(clean, f'public/assets/img/cars/{slug}.webp', CAR_WIDTH)
            hero_bytes = save(clean, f'public/assets/img/hero/{slug}.webp', HERO_WIDTH)
        rows.append((slug, clean.size, car_bytes, hero_bytes, dominant_colour(clean)))

    for slug, size, car_bytes, hero_bytes, colour in rows:
        print(f'{slug:>12}  {size[0]}x{size[1]}  card {car_bytes // 1024} KB  hero {hero_bytes // 1024} KB  {colour}')
    print(f'{len(rows)} image(s) processed')


if __name__ == '__main__':
    main()
