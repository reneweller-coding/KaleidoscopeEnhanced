# catalog_check.py <scandir> — final catalogue quality sweep:
#   WEISS    any variant mean luma > 205, or > 180 with saturation < 0.12
#   SCHWARZ  all three variants mean luma < 6
#   REGENB.  C frame: >= 7 of 12 hue bins carry >= 4% of the saturated
#            pixels AND saturated coverage >= 8% (spatial full rainbow)
# Prints a table; writes catalog_check.json.
import os, sys, json, colorsys
from PIL import Image

scan = sys.argv[1]
sp = os.path.dirname(os.path.abspath(__file__))
stems = sorted({f.rsplit("_", 1)[0] for f in os.listdir(scan) if f.endswith(".png")})

def metrics(p):
    try:
        im = Image.open(p).convert("RGB").resize((160, 100))
    except Exception:
        return 0.0, 0.0, 0.0, 0
    hsv = im.convert("HSV")
    H = list(hsv.getdata(0)); S = list(hsv.getdata(1)); V = list(hsv.getdata(2))
    n = len(H)
    luma = sum(V) / n / 1.0 * (255/255)  # V as brightness proxy
    g = im.convert("L"); hh = g.histogram()
    luma = sum(i*c for i,c in enumerate(hh)) / sum(hh)
    lit = [(h, s) for h, s, v in zip(H, S, V) if v > 40]
    sat_px = [(h, s) for h, s in lit if s > 70]
    satcov = len(sat_px) / n
    mean_sat = (sum(s for _, s in lit) / len(lit) / 255.0) if lit else 0.0
    bins = [0] * 12
    for h, _ in sat_px:
        bins[min(11, h * 12 // 256)] += 1
    strong = sum(1 for b in bins if sat_px and b >= 0.04 * len(sat_px))
    return luma, mean_sat, satcov, strong

rows = []
for st in stems:
    r = {"stem": st}
    flags = []
    lums = {}
    for v in "ABC":
        p = os.path.join(scan, f"{st}_{v}.png")
        if not os.path.exists(p) or os.path.getsize(p) == 0:
            continue
        luma, msat, scov, strong = metrics(p)
        lums[v] = luma
        r[v] = {"luma": round(luma, 1), "sat": round(msat, 2),
                "satcov": round(scov, 2), "huebins": strong}
        if luma > 205 or (luma > 180 and msat < 0.12):
            flags.append("WEISS-" + v)
        if v == "C" and strong >= 7 and scov >= 0.08:
            flags.append("REGENBOGEN")
    if lums and all(x < 6 for x in lums.values()):
        flags = ["SCHWARZ"] + [f for f in flags if not f.startswith("WEISS")]
    r["flags"] = flags
    rows.append(r)

json.dump(rows, open(os.path.join(sp, "catalog_check.json"), "w"), indent=1)
bad = [r for r in rows if r["flags"]]
print(f"{len(rows)} Szenen, {len(bad)} auffaellig")
for r in bad:
    c = r.get("C", {})
    print(f"  {r['stem']:42s} {','.join(r['flags']):24s} "
          f"C: luma={c.get('luma','-')} sat={c.get('sat','-')} bins={c.get('huebins','-')}")
