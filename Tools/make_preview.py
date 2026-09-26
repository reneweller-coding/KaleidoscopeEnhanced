"""Kaleidoscope Enhanced -- the picture GitHub shows when the project is linked:
docs/social-preview.png (1280 x 640).

    python Tools/make_preview.py

The icon, the name, one sentence, and the four README scenes (docs/screenshots/*.png,
1280 x 720 each) as a 2 x 2 grid. Same layout as Noctuary (Tools/make_preview.py) and
Ephemeris (Tools/manual/make_preview.py). GitHub takes it by hand: Settings, General,
Social preview.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
W, H = 1280, 640
BG = (10, 8, 20)             # the icon's own background
NAME = (255, 219, 108)       # the icon's yellow facets
TEXT = (228, 226, 236)
SMALL = (146, 142, 168)
FRAME = (52, 46, 78)
SHOTS = ["kaleidoscope", "chromeform", "shadowtheatre", "aurora"]   # the README's four, same order


def font(name, size):
    try:
        return ImageFont.truetype(os.path.join("C:/Windows/Fonts", name), size)
    except OSError:
        return ImageFont.load_default()


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# Four scenes, 2 x 2, each kept at 16:9 -- the grid is 800 px wide and fills the right side.
gap = 6
tw = (800 - gap) // 2
th = tw * 9 // 16
gx0, gy0 = W - 800 - 30, (H - (2 * th + gap)) // 2
for i, name in enumerate(SHOTS):
    shot = Image.open(os.path.join(ROOT, "docs", "screenshots", name + ".png")).convert("RGB")
    tile = shot.resize((tw, th), Image.LANCZOS)
    x = gx0 + (i % 2) * (tw + gap)
    y = gy0 + (i // 2) * (th + gap)
    img.paste(tile, (x, y))
d.rectangle([gx0 - 1, gy0 - 1, gx0 + 2 * tw + gap, gy0 + 2 * th + gap], outline=FRAME, width=2)

logo = Image.open(os.path.join(ROOT, "icon.png")).convert("RGBA").resize((140, 140), Image.LANCZOS)
img.paste(logo, (56, 78), logo)
d.text((56, 240), "KALEIDOSCOPE", font=font("segoeuib.ttf", 44), fill=NAME)
d.text((58, 292), "ENHANCED", font=font("segoeuib.ttf", 30), fill=NAME)
y = 350
for line in ("A music visualizer that listens", "to whatever is playing:", "866 scenes, 3D models, photos,", "driven by rhythm and mood."):
    d.text((58, y), line, font=font("segoeui.ttf", 23), fill=TEXT)
    y += 32
for line in ("Windows and Linux, Qt 6 / OpenGL 4.3,", "free and open source"):
    d.text((58, y + 14), line, font=font("segoeui.ttf", 18), fill=SMALL)
    y += 25

out = os.path.join(ROOT, "docs", "social-preview.png")
img.save(out, optimize=True)
print("wrote", os.path.relpath(out, ROOT), img.size)
