# triptych_sheets.py <scandir> [outdir] -- one ROW per scene, showing its
# early / middle / late frame side by side.
#
# contact_sheets.py shows only the C frame, which is right for a scene that
# looks the same throughout and misleading for one that is STAGED over its
# lifetime: a ship's fly-by is deliberately off-frame at the end, so its C
# frame is an empty backdrop and the sheet reads as a broken scene. Judging
# an arc needs the arc.
import os, sys
from PIL import Image, ImageDraw

scan = sys.argv[1]
outd = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "triptychs")
os.makedirs(outd, exist_ok=True)
stems = sorted({f.rsplit("_", 1)[0] for f in os.listdir(scan) if f.endswith(".png")})

CW, CH, LBL, ROWS = 236, 148, 15, 9
for si in range(0, len(stems), ROWS):
    batch = stems[si:si + ROWS]
    sheet = Image.new("RGB", (3 * CW, len(batch) * (CH + LBL)), (22, 22, 22))
    d = ImageDraw.Draw(sheet)
    for r, st in enumerate(batch):
        y = r * (CH + LBL)
        d.text((3, y + 2), st[:60], fill=(255, 255, 160))
        for c, tag in enumerate("ABC"):
            p = os.path.join(scan, "%s_%s.png" % (st, tag))
            try:
                sheet.paste(Image.open(p).convert("RGB").resize((CW, CH)), (c * CW, y + LBL))
            except Exception:
                d.rectangle([c*CW, y+LBL, c*CW+CW, y+LBL+CH], fill=(60, 0, 0))
    sheet.save(os.path.join(outd, "trip_%02d.jpg" % (si // ROWS + 1)), quality=84)
print("%d Bogen -> %s" % ((len(stems) + ROWS - 1)//ROWS, outd))
