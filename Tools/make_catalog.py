# make_catalog.py — generate the scene catalogue (Docs/Catalog/):
#   Katalog.md    searchable, git-diffable master document
#   Katalog.html  print layout (same content, embedded styling)
#   img/*.jpg     3 example frames per scene (audio-quiet t=8 / t=16 /
#                 audio-hot t=8), downscaled from the metric-scan renders;
#                 2 example frames per FX overlay (applied over two fixed
#                 reference scenes, one 2D one 3D), downscaled from the
#                 FX-scan renders
#
#   python Tools\make_catalog.py <scan-dir> [<fx-scan-dir>]
#       <scan-dir> holds the <Scene>_{A,B,C}.png frames produced by the
#       scan harness (see memory: scratchpad scan_all.sh).  <fx-scan-dir>
#       holds <Fx>_{2D,3D}.png frames -- each FX shader rendered as the
#       CombineShader over two fixed reference scenes (TunnelPlain for 2D,
#       AuroraBorealisOverFjord for 3D; see scratchpad fx_render.sh).
#       Rendering is NOT done here on purpose — the harness owns that.
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
fxscan = sys.argv[2] if len(sys.argv) > 2 else ""
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
    if "FX" in f:
        continue
    stem = os.path.splitext(os.path.basename(f))[0]
    if not stem or stem in seen:
        continue
    seen.add(stem)
    folder = "Scene3D" if "Scene3D" in f else "Scene2D"
    scenes.append({
        "stem": stem, "folder": folder,
        "type": attrs.get("type", "normal"),
        "geom": attrs.get("geom", ""),
        "mood": attrs.get("mood", ""),
        "complexity": attrs.get("complexity", ""),
        "desc": header_comment(os.path.join(root, folder, stem + ".frag")),
    })
scenes.sort(key=lambda s: (s["folder"], s["stem"].lower()))

# ---- collect FX overlays from Komplett.xml ----
fx, seen_fx = [], set()
for m in re.finditer(r'<CombineShader\b([^>]*)>', xml):
    attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    f = attrs.get("file", "").replace("\\", "/")
    stem = os.path.splitext(os.path.basename(f))[0]
    if not stem or stem in seen_fx:
        continue
    seen_fx.add(stem)
    fx.append({
        "stem": stem,
        "mood": attrs.get("mood", ""),
        "probability": attrs.get("probability", ""),
        "desc": header_comment(os.path.join(root, "FX", stem + ".frag")),
    })
fx.sort(key=lambda s: s["stem"].lower())

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

# FX overlays don't have their own picture — they're shown applied over two
# fixed reference scenes so the effect itself, not the underlying content,
# is what's being compared across all 84 entries.
FX_REF_2D, FX_REF_3D = "TunnelPlain", "AuroraBorealisOverFjord"
FX_CAPTIONS = {"2D": f"über {FX_REF_2D} (2D)", "3D": f"über {FX_REF_3D} (3D)"}
def make_fx_imgs(stem):
    outs = []
    for v in ("2D", "3D"):
        srcp = os.path.join(fxscan, f"{stem}_{v}.png") if fxscan else ""
        dstp = os.path.join(imgd, f"{stem}_{v}.jpg")
        if srcp and os.path.exists(srcp) and HAVE_PIL:
            im = Image.open(srcp).convert("RGB").resize((320, 200))
            im.save(dstp, "JPEG", quality=68)
        if os.path.exists(dstp):
            outs.append((f"img/{stem}_{v}.jpg", FX_CAPTIONS[v]))
    return outs

md, ht = [], []
md.append("# Kaleidoscope Enhanced — Szenen-Katalog\n")
md.append(f"_{len(scenes)} Szenen, {len(fx)} FX-Effekte. Generiert von `Tools/make_catalog.py`; "
          "Beschreibungen stammen aus den Shader-Header-Kommentaren. Szenen-Bilder aus dem "
          "Metrik-Scan-Harness (je: audio-still t=8, audio-still t=16, audio-heiß t=8; "
          f"480×300 → 320×200). FX-Bilder zeigen den Effekt audio-heiß über zwei festen "
          f"Referenzszenen ({FX_REF_2D} für 2D, {FX_REF_3D} für 3D)._\n")
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
ht.append(f"<h1>Kaleidoscope Enhanced — Szenen-Katalog</h1><p class='meta'>{len(scenes)} Szenen, "
          f"{len(fx)} FX-Effekte; generiert von Tools/make_catalog.py. Szenen-Bilder: audio-still "
          f"t=8 / t=16 / audio-heiß t=8. FX-Bilder: audio-heiß über {FX_REF_2D} (2D) / "
          f"{FX_REF_3D} (3D).</p>")

cur_folder = None
for s in scenes:
    if s["folder"] != cur_folder:
        cur_folder = s["folder"]
        label = "2D-Szenen (Scene2D/)" if cur_folder == "Scene2D" else "3D-Szenen (Scene3D/)"
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

md.append(f"\n---\n\n## FX-Effekte (FX/)\n\n_Overlays, keine eigenen Szenen — "
          f"angewendet über {FX_REF_2D} (2D) und {FX_REF_3D} (3D) als feste Referenz, "
          "damit der Effekt selbst vergleichbar bleibt._\n")
ht.append(f"<h1>FX-Effekte (FX/)</h1><p class='meta'>Overlays, keine eigenen Szenen — "
          f"angewendet über {FX_REF_2D} (2D) und {FX_REF_3D} (3D) als feste Referenz.</p>")
for s in fx:
    meta = f"`FX/{s['stem']}.frag`"
    if s["mood"]:        meta += f" · mood={s['mood']}"
    if s["probability"]: meta += f" · probability={s['probability']}"
    md.append(f"\n### {s['stem']}\n\n{meta}\n")
    ht.append(f"<h2>{html.escape(s['stem'])}</h2><p class='meta'>{html.escape(meta.replace('`',''))}</p>")
    if s["desc"]:
        md.append(f"{s['desc']}\n")
        ht.append(f"<p class='desc'>{html.escape(s['desc'])}</p>")
    imgs = make_fx_imgs(s["stem"])
    if imgs:
        md.append(" ".join(f"![{s['stem']} {cap}]({p})" for p, cap in imgs) + "\n")
        ht.append("<div class='imgs'>" + "".join(
            f"<figure><img src='{p}'><figcaption>{cap}</figcaption></figure>"
            for p, cap in imgs) + "</div>")

ht.append("</body></html>")
open(os.path.join(outd, "Katalog.md"), "w", encoding="utf-8", newline="\n").write("\n".join(md))
open(os.path.join(outd, "Katalog.html"), "w", encoding="utf-8", newline="\n").write("".join(ht))
n_img = len([f for f in os.listdir(imgd) if f.endswith(".jpg")])
print(f"catalog: {len(scenes)} Szenen, {len(fx)} FX-Effekte, {n_img} Bilder -> {outd}")
