# contact_sheets.py <scandir> — build labelled contact sheets (5x5 scenes
# per sheet, each cell = the C frame with the scene name) for a full visual
# review of the catalogue without opening 975 files.
import os, sys
from PIL import Image, ImageDraw

scan = sys.argv[1]
sp = os.path.dirname(os.path.abspath(__file__))
outd = os.path.join(sp, "sheets")
os.makedirs(outd, exist_ok=True)
stems = sorted({f.rsplit("_", 1)[0] for f in os.listdir(scan) if f.endswith(".png")})

CW, CH, LBL = 240, 150, 14
COLS, ROWS = 5, 5
per = COLS * ROWS
for si in range(0, len(stems), per):
    batch = stems[si:si + per]
    sheet = Image.new("RGB", (COLS * CW, ROWS * (CH + LBL)), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    for i, st in enumerate(batch):
        x, y = (i % COLS) * CW, (i // COLS) * (CH + LBL)
        p = os.path.join(scan, f"{st}_C.png")
        try:
            im = Image.open(p).convert("RGB").resize((CW, CH))
            sheet.paste(im, (x, y + LBL))
        except Exception:
            d.rectangle([x, y + LBL, x + CW, y + LBL + CH], fill=(60, 0, 0))
        d.text((x + 3, y + 1), st[:38], fill=(255, 255, 160))
    n = si // per + 1
    sheet.save(os.path.join(outd, f"sheet_{n:02d}.jpg"), quality=82)
print(f"{(len(stems) + per - 1) // per} Kontaktboegen -> {outd}")
