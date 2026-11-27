"""Creates the Sewika PWA icons in frontend/public/icons (needs: pip install pillow).

Draws the same picture as frontend/public/favicon.svg: a white heart with a heartbeat
line, an orange signal, blue mountains and a green hill on a dark rounded square.
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)
SS = 4  # draw 4x larger, then shrink, for smooth edges

NAVY, TEAL_DARK = (22, 36, 58), (23, 63, 69)
MOUNTAIN, HILL_TOP, HILL_BOTTOM = (42, 66, 104), (19, 144, 111), (11, 94, 78)
WHITE, PULSE, ORANGE = (255, 255, 255), (14, 122, 98), (233, 162, 59)


def bezier(p0, p1, p2, p3, n=40):
    return [((1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t ** 3 * p3[0],
             (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t ** 3 * p3[1])
            for t in (i / n for i in range(n + 1))]


def quad(p0, p1, p2, n=40):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


HEART = (bezier((240, 304), (200, 274), (118, 222), (118, 158)) + bezier((118, 158), (118, 113), (153, 83), (191, 83))
         + bezier((191, 83), (214, 83), (231, 96), (240, 114)) + bezier((240, 114), (249, 96), (266, 83), (289, 83))
         + bezier((289, 83), (327, 83), (362, 113), (362, 158)) + bezier((362, 158), (362, 222), (280, 274), (240, 304)))


def icon(size, maskable=False):
    big = size * SS
    # Maskable icons are cut to a circle by Android, so the picture is drawn smaller in the middle.
    scale = big / 512 * (0.8 if maskable else 1)
    off = (big - 512 * scale) / 2

    def P(x, y):
        return (off + x * scale, off + y * scale)

    # background: diagonal navy -> dark teal
    bg = Image.new('RGB', (big, big))
    px = bg.load()
    for y in range(big):
        for x in range(0, big):
            t = (x + y) / (2 * big)
            px[x, y] = tuple(int(a + (b - a) * t) for a, b in zip(NAVY, TEAL_DARK))
    d = ImageDraw.Draw(bg)
    # mountains and hill (full width, also behind the corners of a maskable icon)
    d.polygon([(0, P(0, 400)[1])] + [P(*p) for p in [(95, 348), (150, 372), (250, 300), (322, 350), (372, 318)]]
              + [(big, P(512, 382)[1]), (big, big), (0, big)], fill=MOUNTAIN)
    hill = [(0, P(0, 444)[1])] + [P(*p) for p in quad((0, 444), (256, 404), (512, 432))] + [(big, P(512, 432)[1]), (big, big), (0, big)]
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).polygon(hill, fill=255)
    top = P(0, 410)[1]
    grad = Image.new('RGB', (big, big))
    gd = ImageDraw.Draw(grad)
    for y in range(big):
        t = min(1, max(0, (y - top) / (big - top)))
        gd.line([(0, y), (big, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(HILL_TOP, HILL_BOTTOM)))
    bg.paste(grad, (0, 0), mask)
    # heart and heartbeat
    d.polygon([P(*p) for p in HEART], fill=WHITE)
    w = int(15 * scale)
    pts = [P(*p) for p in [(146, 176), (202, 176), (216, 150), (232, 206), (248, 132), (262, 176), (334, 176)]]
    d.line(pts, fill=PULSE, width=w, joint='curve')
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=PULSE)
    # signal: dot and two arcs
    cx, cy = P(372, 192)
    r = 17 * scale
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE)
    w = int(19 * scale)
    for rad in (48, 86):
        R = rad * scale
        d.arc([cx - R - w / 2, cy - R - w / 2, cx + R + w / 2, cy + R + w / 2], 270, 360, fill=ORANGE, width=w)
        for ex, ey in ((cx, cy - R), (cx + R, cy)):
            d.ellipse([ex - w / 2, ey - w / 2, ex + w / 2, ey + w / 2], fill=ORANGE)

    img = bg.convert('RGBA')
    if not maskable:  # rounded corners
        corners = Image.new('L', (big, big), 0)
        ImageDraw.Draw(corners).rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 112 / 512), fill=255)
        img.putalpha(corners)
    return img.resize((size, size), Image.LANCZOS)


icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, True).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('Icons written to', os.path.abspath(OUT))
