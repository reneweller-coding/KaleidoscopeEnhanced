# make_catalog.py — generate the scene catalogue (Docs/Catalog/):
#   Katalog.md    searchable, git-diffable master document
#   Katalog.html  print layout (same content, embedded styling)
#   img/*.jpg     3 example frames per scene (audio-quiet t=8 / t=16 /
#                 audio-hot t=8), downscaled from the metric-scan renders
#
#   python Tools\make_catalog.py <scan-dir>
#       <scan-dir> holds the <Scene>_{A,B,C}.png frames produced by the
#       scan harness (see memory: scratchpad scan_all.sh).  Rendering is
#       NOT done here on purpose — the harness owns that.
#
# PDF export (done by the caller, requires Edge):
#   msedge --headless --print-to-pdf="...\Katalog.pdf" "file:///...\Katalog.html"
#
# Descriptions come from each shader's own header comment (the first
# comment block in the .frag), so maintaining the catalogue = maintaining
# the shader headers, which we do anyway.
import re, os, sys, html

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scan = sys.argv[1] if len(sys.argv) > 1 else ""
outd = os.path.join(root, "Docs", "Catalog")
imgd = os.path.join(outd, "img")
os.makedirs(imgd, exist_ok=True)

try:
    from PIL import Image
    HAVE_PIL = True
except ImportError:
    HAVE_PIL = False

# Scenes whose editor-preview frames are known to be unrepresentative
# (sim textures not stepped / shadow-OIT multi-pass limitation / state
# warm-up) — flagged in the catalogue instead of looking "broken".
PREVIEW_LIMITED = {
    "VolumetricFire", "Fluid", "Physarum", "SpectroWeave", "InkTank",
    "PillarHall", "ShadowForest", "CathedralGlass", "SmokeHall",
    "Detonation", "MetaSculpt", "Origami", "BloomSculpt", "CoralGrowth",
    "MelodyScript", "Schlieren", "SelfSimilarity",
    # Live-verified but preview-dark: array-fed (audioChroma/Melody) or
    # sim-textured scenes the harness cannot drive.
    "SciFiHUD", "Tonnetz", "GlassStack", "CrystalGrowth",
}

def header_comment(path):
    """First // comment block of a shader = its self-description."""
    if not os.path.exists(path):
        return ""
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    block, started = [], False
    for ln in lines[:45]:
        s = ln.strip()
        if s.startswith("//"):
            t = s.lstrip("/").strip()
            if t.strip("-— =*"):
                block.append(t)
            started = True
        elif started and block:
            break
        elif s.startswith("#") or s.startswith("out ") or not s:
            continue
        elif s.startswith("uniform") or s.startswith("in "):
            if block:
                break
            continue
        else:
            break
    txt = " ".join(block)
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt[:420] + ("…" if len(txt) > 420 else "")

# ---- collect scenes from Komplett.xml (the exhaustive reference) ----
xml = open(os.path.join(root, "Configurations", "Komplett.xml"), encoding="utf-8").read()
scenes, seen = [], set()
for m in re.finditer(r'<TextureShader\b([^>]*)>', xml):
    attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    f = attrs.get("file", "").replace("\\", "/")
    if "Combine" in f:
        continue
    stem = os.path.splitext(os.path.basename(f))[0]
    if not stem or stem in seen:
        continue
    seen.add(stem)
    folder = "Scene3D" if "Scene3D" in f else "Scene"
    scenes.append({
        "stem": stem, "folder": folder,
        "type": attrs.get("type", "normal"),
        "geom": attrs.get("geom", ""),
        "mood": attrs.get("mood", ""),
        "complexity": attrs.get("complexity", ""),
        "desc": header_comment(os.path.join(root, folder, stem + ".frag")),
    })
scenes.sort(key=lambda s: (s["folder"], s["stem"].lower()))

# ---- images: downscale the scan frames into img/ ----
def make_imgs(stem):
    outs = []
    for v in "ABC":
        srcp = os.path.join(scan, f"{stem}_{v}.png") if scan else ""
        dstp = os.path.join(imgd, f"{stem}_{v}.jpg")
        if srcp and os.path.exists(srcp) and HAVE_PIL:
            im = Image.open(srcp).convert("RGB").resize((320, 200))
            im.save(dstp, "JPEG", quality=68)
        if os.path.exists(dstp):
            outs.append(f"img/{stem}_{v}.jpg")
    return outs

CAPTIONS = ["ruhig (t=8)", "ruhig (t=16)", "audio-heiß (t=8)"]

md, ht = [], []
md.append("# Kaleidoscope Enhanced — Szenen-Katalog\n")
md.append(f"_{len(scenes)} Szenen. Generiert von `Tools/make_catalog.py`; Beschreibungen "
          "stammen aus den Shader-Header-Kommentaren, Bilder aus dem Metrik-Scan-Harness "
          "(je: audio-still t=8, audio-still t=16, audio-heiß t=8; 480×300 → 320×200)._\n")
ht.append("<!DOCTYPE html><html><head><meta charset='utf-8'><title>Kaleidoscope Szenen-Katalog</title><style>"
          "body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#222}"
          "h1{border-bottom:2px solid #444}h2{margin:18px 0 2px;page-break-after:avoid}"
          ".meta{color:#666;font-size:0.85em;margin:0 0 4px}"
          ".desc{font-size:0.92em;margin:0 0 6px}"
          ".imgs{white-space:nowrap;page-break-inside:avoid}"
          ".imgs figure{display:inline-block;margin:0 8px 14px 0;text-align:center}"
          ".imgs img{width:230px;border:1px solid #ccc}"
          ".imgs figcaption{font-size:0.72em;color:#888}"
          ".limited{color:#a60;font-size:0.8em}"
          "</style></head><body>")
ht.append(f"<h1>Kaleidoscope Enhanced — Szenen-Katalog</h1><p class='meta'>{len(scenes)} Szenen; "
          "generiert von Tools/make_catalog.py. Bilder: audio-still t=8 / t=16 / audio-heiß t=8.</p>")

cur_folder = None
for s in scenes:
    if s["folder"] != cur_folder:
        cur_folder = s["folder"]
        label = "2D-Szenen (Scene/)" if cur_folder == "Scene" else "3D-Szenen (Scene3D/)"
        md.append(f"\n---\n\n## {label}\n")
        ht.append(f"<h1>{label}</h1>")
    meta = f"`{s['folder']}/{s['stem']}.frag` · type={s['type']}"
    if s["geom"]:       meta += f" · geom={s['geom']}"
    if s["mood"]:       meta += f" · mood={s['mood']}"
    if s["complexity"]: meta += f" · complexity={s['complexity']}"
    md.append(f"\n### {s['stem']}\n\n{meta}\n")
    ht.append(f"<h2>{html.escape(s['stem'])}</h2><p class='meta'>{html.escape(meta.replace('`',''))}</p>")
    if s["stem"] in PREVIEW_LIMITED:
        md.append("_(Vorschau eingeschränkt: Sim-Textur/Mehrpass — Bilder unterschätzen die echte App)_\n")
        ht.append("<p class='limited'>Vorschau eingeschränkt: Sim-Textur/Mehrpass — Bilder unterschätzen die echte App</p>")
    if s["desc"]:
        md.append(f"{s['desc']}\n")
        ht.append(f"<p class='desc'>{html.escape(s['desc'])}</p>")
    imgs = make_imgs(s["stem"])
    if imgs:
        md.append(" ".join(f"![{s['stem']} {CAPTIONS[i]}]({p})" for i, p in enumerate(imgs)) + "\n")
        ht.append("<div class='imgs'>" + "".join(
            f"<figure><img src='{p}'><figcaption>{CAPTIONS[i]}</figcaption></figure>"
            for i, p in enumerate(imgs)) + "</div>")

ht.append("</body></html>")
open(os.path.join(outd, "Katalog.md"), "w", encoding="utf-8", newline="\n").write("\n".join(md))
open(os.path.join(outd, "Katalog.html"), "w", encoding="utf-8", newline="\n").write("".join(ht))
n_img = len([f for f in os.listdir(imgd) if f.endswith(".jpg")])
print(f"catalog: {len(scenes)} Szenen, {n_img} Bilder -> {outd}")
