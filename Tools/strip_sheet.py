# strip_sheet.py -- lay one transition's filmstrip out as a single sheet.
# Reading ten frames one by one costs far more than looking at one row.
import sys, os, glob
from PIL import Image, ImageDraw
name = sys.argv[1]
d = sys.argv[2] if len(sys.argv) > 2 else "Docs/Catalog/rendered/strip"
stamps = [2.5, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.5, 13.5]
fs = sorted(glob.glob(os.path.join(d, name + "_[0-9][0-9].png")))
tw, th, cols = 384, 216, 5
rows = (len(fs) + cols - 1) // cols
sheet = Image.new("RGB", (tw * cols, (th + 16) * rows), (18, 18, 22))
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(fs):
    c, r = i % cols, i // cols
    x, y = c * tw, r * (th + 16)
    sheet.paste(Image.open(f).convert("RGB").resize((tw, th)), (x, y + 16))
    dr.text((x + 4, y + 3), "t=%.1fs" % stamps[i] if i < len(stamps) else str(i), fill=(240, 240, 240))
out = os.path.join(d, "_%s.jpg" % name)
sheet.save(out, quality=88)
print(out)
