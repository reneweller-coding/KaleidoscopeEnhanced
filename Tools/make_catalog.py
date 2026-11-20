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
#   python Tools\make_catalog.py --data-only [--data-out <file>]
#       [--neighbours <tsv>] [--reactivity <tsv>]
#       Writes only catalog-data.js (the data of docs/Catalog/index.html):
#       no picture is touched, Katalog.md and Katalog.html stay as they
#       are.  --data-out writes it elsewhere (a test); --neighbours and
#       --reactivity name other files than Tools/scene_neighbours.tsv and
#       Tools/scene_reactivity.tsv.  Both are optional, like the strips in
#       docs/Catalog/strip/; see the data section at the end.
#
# PDF export (done by the caller, requires Edge):
#   msedge --headless --print-to-pdf="...\Katalog.pdf" "file:///...\Katalog.html"
#
# Descriptions come from each shader's own header comment (the first
# comment block in the .frag), so maintaining the catalogue = maintaining
# the shader headers, which we do anyway.
import re, os, html, argparse, math

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(description="Generate the scene catalogue (docs/Catalog).")
ap.add_argument("scan", nargs="?", default="", help="folder of the scenes' <Scene>_{A,B,C}.png frames")
ap.add_argument("fxscan", nargs="?", default="", help="folder of the overlays' and transitions' <Name>_{2D,3D}.png frames")
ap.add_argument("--data-only", action="store_true",
                help="write only catalog-data.js: no pictures, Katalog.md and Katalog.html untouched")
ap.add_argument("--data-out", default="", help="where catalog-data.js goes (default: docs/Catalog/catalog-data.js)")
ap.add_argument("--neighbours", default=os.path.join(root, "Tools", "scene_neighbours.tsv"),
                help="similar scenes (name, neighbours = comma list, nearest first); optional")
ap.add_argument("--reactivity", default=os.path.join(root, "Tools", "scene_reactivity.tsv"),
                help="reaction to the music (name, react = 0..1); optional")
args = ap.parse_args()
scan = "" if args.data_only else args.scan
fxscan = "" if args.data_only else args.fxscan
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
    "VolumetricFire", "Fluid", "Physarum", "SpectroWeave",
    "PillarHall", "ShadowForest", "CathedralGlass", "SmokeHall",
    "Detonation", "MetaSculpt", "Origami", "BloomSculpt", "CoralGrowth",
    "MelodyScript", "Schlieren", "SelfSimilarity",
    # Live-verified but preview-dark: array-fed (audioChroma/Melody) or
    # sim-textured scenes the harness cannot drive.
    "SciFiHUD", "Tonnetz", "CrystalGrowth",
}

def header_comment(path):
    """First comment block of a shader = its self-description.

    Three header styles occur in the wild: the original plain "// Name.ext
    ... prose ..." block, the Doxygen "/** @file ... @brief ... */" block,
    and the CGVR layout every shader carries now (Tools/glsl_fileheader.py):
    a banner with the file's name, then "/*! @file @brief ... @author ... */".
    All are handled so the catalogue keeps working regardless of which one a
    given file carries.
    """
    if not os.path.exists(path):
        return ""
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    block, started, in_doxy, in_banner = [], False, False, False
    for ln in lines[:80]:
        s = ln.strip()
        if in_banner:
            if s.startswith("\\"):
                in_banner = False
            continue
        if in_doxy:
            if s.startswith("*/"):
                break
            t = s.lstrip("*").strip()
            if t.startswith(("@file", "@author")):
                continue
            t = re.sub(r"^@brief\s*", "", t)
            if t:
                block.append(t)
            continue
        if s.startswith("/*") and s.endswith("\\"):              # the banner above the CGVR file block
            in_banner = True
            continue
        if s.startswith(("/**", "/*!")):
            in_doxy = True
            continue
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
xml = open(os.path.join(root, "Presets", "Komplett.xml"), encoding="utf-8").read()
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

# ---- collect FX overlays + scene transitions from Komplett.xml ----
def collect_entries(tag, folder):
    out, seen = [], set()
    for m in re.finditer(r'<' + tag + r'\b([^>]*)>', xml):
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        f = attrs.get("file", "").replace("\\", "/")
        stem = os.path.splitext(os.path.basename(f))[0]
        if not stem or stem in seen:
            continue
        seen.add(stem)
        out.append({
            "stem": stem,
            "mood": attrs.get("mood", ""),
            "probability": attrs.get("probability", ""),
            "desc": header_comment(os.path.join(root, folder, stem + ".frag")),
        })
    out.sort(key=lambda s: s["stem"].lower())
    return out

fx    = collect_entries("CombineShader", "FX")
trans = collect_entries("TransitionShader", "Transitions")

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

# Die dritte Marke liegt bei t=21 (render_catalog_images.ps1 zieht -ss 21):
# die WAV ist ab 17 s audio-heiss, und eine inszenierte Szene (Solo dort auf
# 23-24 s gesetzt) steht bei 21 s kurz vor dem Ende ihres Bogens.  Die
# Beschriftung sagte "t=8" -- das war die alte Marke.
CAPTIONS = ["ruhig (t=8)", "ruhig (t=16)", "audio-heiß (t=21)"]

# FX overlays and transitions don't have their own picture — they're shown
# applied over two fixed reference scenes so the effect itself, not the
# underlying content, is what's being compared across all entries.
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
md.append(f"_{len(scenes)} Szenen, {len(fx)} FX-Overlays, {len(trans)} Übergänge. "
          "Generiert von `Tools/make_catalog.py`; "
          "Beschreibungen stammen aus den Shader-Header-Kommentaren. Szenen-Bilder aus dem "
          "Metrik-Scan-Harness (je: audio-still t=8, audio-still t=16, audio-heiß t=8; "
          f"480×300 → 320×200). FX-/Übergangs-Bilder zeigen den Effekt audio-heiß über zwei "
          f"festen Referenzszenen ({FX_REF_2D} für 2D, {FX_REF_3D} für 3D)._\n")
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
          f"{len(fx)} FX-Overlays, {len(trans)} Übergänge; generiert von Tools/make_catalog.py. "
          f"Szenen-Bilder: audio-still t=8 / t=16 / audio-heiß t=8. FX-/Übergangs-Bilder: "
          f"audio-heiß über {FX_REF_2D} (2D) / {FX_REF_3D} (3D).</p>")

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

def emit_effect_section(entries, folder, md_title, md_intro, ht_intro):
    md.append(f"\n---\n\n## {md_title}\n\n{md_intro}\n")
    ht.append(f"<h1>{md_title}</h1><p class='meta'>{ht_intro}</p>")
    for s in entries:
        meta = f"`{folder}/{s['stem']}.frag`"
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

emit_effect_section(
    fx, "FX", "FX-Overlays (FX/)",
    f"_Overlays über der laufenden Szene, keine eigenen Szenen — angewendet über "
    f"{FX_REF_2D} (2D) und {FX_REF_3D} (3D) als feste Referenz, "
    "damit der Effekt selbst vergleichbar bleibt._",
    f"Overlays über der laufenden Szene, keine eigenen Szenen — angewendet über "
    f"{FX_REF_2D} (2D) und {FX_REF_3D} (3D) als feste Referenz.")

emit_effect_section(
    trans, "Transitions", "Übergänge (Transitions/)",
    "_Szenen-Überblendungen: mischen die alte Szene (interpolation=1) in die neue "
    "(interpolation=0). Bilder — wo vorhanden — zeigen den Effekt mitten in der "
    f"Überblendung über {FX_REF_2D} (2D) und {FX_REF_3D} (3D)._",
    "Szenen-Überblendungen: mischen die alte Szene (interpolation=1) in die neue "
    "(interpolation=0).")

ht.append("</body></html>")
if not args.data_only:
    open(os.path.join(outd, "Katalog.md"), "w", encoding="utf-8", newline="\n").write("\n".join(md))
    open(os.path.join(outd, "Katalog.html"), "w", encoding="utf-8", newline="\n").write("".join(ht))

# ---- the data of the browsable catalogue (docs/Catalog/index.html: search, filters by kind, genre and mood) ----
# One line of JavaScript, loaded by a script tag, so the page also works from the disk (a fetch() of a JSON file does
# not, there).  Per entry: n name, k kind (2D / 3D / FX / T), m moods, g the genre presets it is in, r the interest
# rating (scenes), c complexity, d the description, i which pictures exist.
# Optional keys, present only where another tool has measured something (the page works without them):
#   s  similar scenes, up to eight names, nearest first -- the column `neighbours` of Tools/scene_neighbours.tsv
#      (header: name, cluster, dup_group, neighbours, distances); names the catalogue does not hold are dropped
#   x  how much the entry reacts to the music, 0..1 to two decimals -- the column `react` (a percentile rank) of
#      Tools/scene_reactivity.tsv (header: name, react_struct, react_sync, react)
#   p  1 when a transition has its strip docs/Catalog/strip/<Name>.jpg (five frames of the blend in one picture)
# A name both a scene and a transition carry (VoronoiShatter) gets s and x on the scene, p on the transition.
import json

def read_tsv(path):
    """Rows of a tab-separated file with a header line, as dicts; [] when the file is missing."""
    if not path or not os.path.exists(path):
        return []
    lines = [ln for ln in open(path, encoding="utf-8-sig").read().splitlines() if ln.strip() and not ln.startswith("#")]
    if not lines:
        return []
    head = [h.strip() for h in lines[0].split("\t")]
    return [dict(zip(head, (v.strip() for v in ln.split("\t")))) for ln in lines[1:]]

known = {s["stem"] for s in scenes} | {s["stem"] for s in fx} | {s["stem"] for s in trans}
similar = {}
for row in read_tsv(args.neighbours):
    name = row.get("name", "")
    near = [n.strip() for n in row.get("neighbours", "").split(",")]
    near = [n for n in near if n and n != name and n in known][:8]
    if name in known and near:
        similar[name] = near
reaction = {}
for row in read_tsv(args.reactivity):
    try:
        v = float(row.get("react", ""))
    except ValueError:
        continue
    if row.get("name", "") in known and math.isfinite(v):
        reaction[row["name"]] = round(min(1.0, max(0.0, v)), 2)
stripd = os.path.join(outd, "strip")
strips = {os.path.splitext(f)[0] for f in os.listdir(stripd) if f.endswith(".jpg")} if os.path.isdir(stripd) else set()
named = set()
def extras(d):
    """Adds the optional keys to one entry; s and x go to the first entry of a name only."""
    if d["n"] not in named:
        named.add(d["n"])
        if d["n"] in similar:
            d["s"] = similar[d["n"]]
        if d["n"] in reaction:
            d["x"] = reaction[d["n"]]
    if d["k"] == "T" and d["n"] in strips:
        d["p"] = 1
    return d

GENRES = ["Ambient", "SpaceAmbient", "Downtempo", "Cinematic", "Club", "Electronic", "Psytrance", "Psychedelic", "Noir"]
member = {}
for g in GENRES:
    p = os.path.join(root, "Presets", g + ".xml")
    if os.path.exists(p):
        for stem in set(re.findall(r'file="[^"]*?(\w+)\.frag"', open(p, encoding="utf-8", errors="replace").read())):
            member.setdefault(stem, []).append(g)
interest = {}
fitp = os.path.join(root, "Tools", "preset_fit.tsv")
if os.path.exists(fitp):
    rows = [ln.split("\t") for ln in open(fitp, encoding="utf-8").read().splitlines() if ln.strip()]
    col = rows[0].index("interest") if "interest" in rows[0] else -1
    for v in rows[1:]:
        if col >= 0 and len(v) > col and v[col].strip().isdigit():
            interest[v[0]] = int(v[col])
have = set(os.listdir(imgd))
def pictures(stem, marks):
    return [v for v in marks if f"{stem}_{v}.jpg" in have]
data = []
for s in scenes:
    data.append(extras({"n": s["stem"], "k": "3D" if s["folder"] == "Scene3D" else "2D", "m": [t for t in s["mood"].split(",") if t],
                        "g": member.get(s["stem"], []), "r": interest.get(s["stem"], 0), "c": s["complexity"], "d": s["desc"],
                        "i": pictures(s["stem"], "ABC")}))
for kind, entries in (("FX", fx), ("T", trans)):
    for s in entries:
        data.append(extras({"n": s["stem"], "k": kind, "m": [t for t in s["mood"].split(",") if t], "g": member.get(s["stem"], []),
                            "r": 0, "c": "", "d": s["desc"], "i": pictures(s["stem"], ("2D", "3D"))}))
datap = args.data_out or os.path.join(outd, "catalog-data.js")
open(datap, "w", encoding="utf-8", newline="\n").write(
    "window.CATALOG=" + json.dumps({"genres": GENRES, "entries": data}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(f"catalog-data.js: {len(data)} entries, {sum('s' in d for d in data)} with similar scenes, "
      f"{sum('x' in d for d in data)} with a reaction, {sum('p' in d for d in data)} strips -> {datap}")

n_img = len([f for f in os.listdir(imgd) if f.endswith(".jpg")])
if not args.data_only:
    print(f"catalog: {len(scenes)} Szenen, {len(fx)} FX-Overlays, {len(trans)} Übergänge, {n_img} Bilder -> {outd}")
