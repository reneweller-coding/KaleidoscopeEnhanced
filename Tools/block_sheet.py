# block_sheet.py -- one sheet for a whole block of transitions.
# Three frames per transition (early, middle, late of the fade) is enough to
# judge whether the arc starts clean, does its one thing and lands clean --
# and it costs a tenth of what looking at every strip costs.
import sys, os, glob
from PIL import Image, ImageDraw
d = "Docs/Catalog/rendered/strip"
names = sys.argv[1].split(",")
picks = [2, 4, 6]                      # t = 5.0, 7.0, 9.0 of the arc
tw, th = 400, 225
sheet = Image.new("RGB", (tw*3, (th+16)*len(names)), (18,18,22))
dr = ImageDraw.Draw(sheet)
for r, n in enumerate(names):
    fs = sorted(glob.glob(os.path.join(d, n + "_[0-9][0-9].png")))
    for c, k in enumerate(picks):
        x, y = c*tw, r*(th+16)
        if k < len(fs):
            sheet.paste(Image.open(fs[k]).convert("RGB").resize((tw, th)), (x, y+16))
        dr.text((x+4, y+3), "%s  %d/3" % (n, c+1), fill=(240,240,240))
out = os.path.join(d, "_block.jpg")
sheet.save(out, quality=86)
print(out)
