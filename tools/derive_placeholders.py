#!/usr/bin/env python3
"""Create placeholder listing photos for models we do not have real photos of.

Mirroring and re-cropping the existing studio shots gives every listing a
distinct-looking cover instead of repeating one image. These are placeholders:
the dealership replaces them with real photos from the admin panel.

Usage: python3 tools/derive_placeholders.py
"""
import os

from PIL import Image, ImageEnhance

STUDIO = 'public/assets/img/cars'
PHOTOS = 'public/assets/img/photos'

# target slug: (source image, zoom, x-shift, y-shift, mirror, saturation)
VARIANTS = {
    'sportage': (f'{STUDIO}/prado.webp', 1.22, 0.62, 0.58, True, 0.85),
    'tucson': (f'{STUDIO}/prado.webp', 1.34, 0.34, 0.60, False, 0.0),
    'mghs': (f'{STUDIO}/prado.webp', 1.14, 0.80, 0.52, True, 1.05),
    'brv': (f'{PHOTOS}/suv.jpg', 1.28, 0.42, 0.55, False, 0.9),
    'vezel': (f'{PHOTOS}/suv-premium.jpg', 1.32, 0.66, 0.58, True, 1.0),
    'swift': (f'{STUDIO}/cultus.webp', 1.20, 0.44, 0.56, True, 1.1),
    'picanto': (f'{STUDIO}/cultus.webp', 1.32, 0.70, 0.60, False, 0.55),
    'mira': (f'{STUDIO}/alto.webp', 1.30, 0.38, 0.60, True, 0.9),
    'cuore': (f'{STUDIO}/alto.webp', 1.18, 0.72, 0.55, False, 1.05),
    'bolan': (f'{STUDIO}/wagonr.webp', 1.24, 0.50, 0.58, True, 0.9),
    'vitz': (f'{STUDIO}/cultus.webp', 1.15, 0.30, 0.62, False, 0.8),
    'passo': (f'{STUDIO}/wagonr.webp', 1.34, 0.64, 0.56, False, 1.05),
    'ravi': (f'{STUDIO}/hilux.webp', 1.26, 0.36, 0.60, True, 0.9),
    'every': (f'{STUDIO}/wagonr.webp', 1.22, 0.44, 0.60, True, 0.85),
}


def derive(source, target, zoom, x, y, mirror, saturation):
    with Image.open(source) as raw:
        image = raw.convert('RGB')
    width, height = image.size
    crop_width = int(width / zoom)
    crop_height = int(height / zoom)
    left = int((width - crop_width) * x)
    top = int((height - crop_height) * y)
    image = image.crop((left, top, left + crop_width, top + crop_height))
    # Keep a 16:9 frame so cards and galleries stay consistent.
    ratio = 16 / 9
    if image.width / image.height > ratio:
        new_width = int(image.height * ratio)
        offset = (image.width - new_width) // 2
        image = image.crop((offset, 0, offset + new_width, image.height))
    else:
        new_height = int(image.width / ratio)
        offset = int((image.height - new_height) * 0.55)
        image = image.crop((0, offset, image.width, offset + new_height))
    if mirror:
        image = image.transpose(Image.FLIP_LEFT_RIGHT)
    if saturation and abs(saturation - 1) > 0.01:
        image = ImageEnhance.Color(image).enhance(saturation)
    image = image.resize((1200, 675), Image.LANCZOS)
    image.save(target, 'WEBP', quality=82, method=5)
    return os.path.getsize(target)


if __name__ == '__main__':
    for slug, settings in VARIANTS.items():
        target = f'{STUDIO}/{slug}.webp'
        size = derive(settings[0], target, *settings[1:])
        print(f'{slug:>10}  {size // 1024} KB  ← {os.path.basename(settings[0])}')
    print(f'{len(VARIANTS)} placeholder photos written to {STUDIO}/')
