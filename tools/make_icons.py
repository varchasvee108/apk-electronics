"""Generate Bench's app icon set (pulse trace ending in an LED dot) with Pillow."""
import sys
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]
TEAL = (14, 124, 107)
TEAL_DARK = (10, 95, 82)
WHITE = (255, 255, 255)
AMBER = (255, 196, 61)

# pulse trace in unit coordinates (x, y), y down
TRACE = [(0.16, 0.56), (0.34, 0.56), (0.43, 0.30), (0.53, 0.76), (0.61, 0.44), (0.67, 0.56), (0.765, 0.56)]
DOT = (0.82, 0.56)


def draw_symbol(size, scale=1.0, offset=(0.0, 0.0), color=WHITE, dot=AMBER, glow=True, ss=4):
    """Transparent layer with the trace + LED dot. `scale` shrinks around the centre (adaptive safe zone)."""
    S = size * ss
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    def P(x, y):
        cx = 0.5 + (x - 0.5) * scale + offset[0]
        cy = 0.5 + (y - 0.5) * scale + offset[1]
        return (cx * S, cy * S)

    w = int(0.065 * S * scale)
    if glow and dot:
        # blur only the alpha so the halo stays amber (blurring RGBA over transparent black darkens it)
        a = Image.new('L', (S, S), 0)
        r = 0.12 * S * scale
        x, y = P(*DOT)
        ImageDraw.Draw(a).ellipse([x - r, y - r, x + r, y + r], fill=140)
        a = a.filter(ImageFilter.GaussianBlur(0.05 * S * scale))
        g = Image.new('RGBA', (S, S), dot + (0,))
        g.putalpha(a)
        img.alpha_composite(g)
    d = ImageDraw.Draw(img)
    pts = [P(x, y) for x, y in TRACE]
    d.line(pts, fill=color + (255,), width=w, joint='curve')
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=color + (255,))
    if dot:
        r = 0.055 * S * scale
        x, y = P(*DOT)
        d.ellipse([x - r, y - r, x + r, y + r], fill=dot + (255,))
        hr = r * 0.28
        hx, hy = x - r * 0.38, y - r * 0.38
        d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=(255, 255, 255, 230))
    return img.resize((size, size), Image.LANCZOS)


def background(size, rounded=False, ss=2):
    S = size * ss
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # subtle vertical gradient
    for y in range(S):
        t = y / S
        c = tuple(int(TEAL[i] * (1 - t) + TEAL_DARK[i] * t) for i in range(3))
        d.line([(0, y), (S, y)], fill=c + (255,))
    # faint breadboard holes along the bottom
    hole = int(S * 0.018)
    for k in range(9):
        x = S * (0.18 + k * 0.08)
        for row in (0.80, 0.86):
            d.rounded_rectangle([x - hole, S * row - hole, x + hole, S * row + hole], radius=hole // 3, fill=(255, 255, 255, 34))
    if rounded:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=255)
        img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


# iOS / general icon (opaque square, the OS applies its own mask)
icon = background(1024)
icon.alpha_composite(draw_symbol(1024))
icon.convert('RGB').save(f'{out}/icon.png')

# Android adaptive: background, foreground (safe zone ≈ 66 %), monochrome
background(1024).convert('RGB').save(f'{out}/android-icon-background.png')
draw_symbol(1024, scale=0.62).save(f'{out}/android-icon-foreground.png')
draw_symbol(1024, scale=0.62, color=WHITE, dot=WHITE, glow=False).save(f'{out}/android-icon-monochrome.png')

# splash: teal symbol on transparent (shown on a white background)
draw_symbol(1024, color=TEAL, dot=AMBER).save(f'{out}/splash-icon.png')

# favicon
fav = background(256, rounded=True)
fav.alpha_composite(draw_symbol(256))
fav.resize((48, 48), Image.LANCZOS).save(f'{out}/favicon.png')
icon.resize((512, 512), Image.LANCZOS).convert('RGB').save(f'{out}/../../docs/screenshots/app-icon.png')
print('icons written')
