"""Creates the PWA icons in frontend/public/icons (needs: pip install pillow)."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)


def icon(size, maskable=False):
    img = Image.new('RGBA', (size, size), (22, 36, 58, 255) if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(size * 0.12) if maskable else 0
    if not maskable:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=(22, 36, 58, 255))

    def P(x, y):
        inner = size - 2 * pad
        return (pad + x / 64 * inner, pad + y / 64 * inner)

    d.polygon([P(8, 46), P(22, 28), P(30, 37), P(40, 22), P(56, 46)], fill=(14, 107, 92, 255))
    d.polygon([P(36, 28), P(40, 22), P(44, 28)], fill=(238, 242, 245, 255))
    for x, y, h, c in [(14, 50, 6, (233, 162, 59)), (24, 46, 10, (233, 162, 59)), (34, 42, 14, (233, 162, 59)), (44, 38, 18, (238, 242, 245))]:
        x0, y0 = P(x, y)
        x1, y1 = P(x + 6, y + h)
        d.rounded_rectangle([x0, y0, x1, y1], radius=max(1, int(size * 0.02)), fill=c + (255,))
    return img


icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, True).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('Icons written to', os.path.abspath(OUT))
