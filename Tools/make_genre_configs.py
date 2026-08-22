# -*- coding: utf-8 -*-
"""Regenerate the genre presets (and the one Test preset) from Komplett.xml.

Komplett.xml is the master list: every scene and FX entry lives there with
its mood tags, formulas and parameter ranges.  This tool filters that master
by mood into the genre configurations, so adding a scene to Komplett (with
moods) and re-running this script is all it takes to roll it out everywhere.

    python Tools/make_genre_configs.py          (run from the repo root)

Genres (scene AND FX entries are filtered by the same rule):
    Ambient      calm or dreamy, never aggressive
    SpaceAmbient the hand-curated `space` tag: ships, worlds, deep sky --
                 long scene times and long crossfades (see TIMING)
    Club         aggressive, or bright without calm
    Noir         dark
    Psychedelic  psychedelic
    Galerie      calm/bright/dreamy, never aggressive or psychedelic
    Allround     everything
    TestAlle     everything, hidden — the name starts with "Test", which
                 flips the engine into review mode (alphabetical order,
                 fixed 8 s per scene, 'n' steps onward)
"""
import re, os, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SRC = "Configurations/Komplett.xml"
IMAGE_DIR = "C:\\\\Users\\\\rene\\\\Desktop\\\\BilderPhotoechoes"

def rule_ambient(m):     return ("calm" in m or "dreamy" in m) and "aggressive" not in m
def rule_club(m):        return "aggressive" in m or ("bright" in m and "calm" not in m)
def rule_noir(m):        return "dark" in m
def rule_psychedelic(m): return "psychedelic" in m
def rule_galerie(m):     return (("calm" in m or "bright" in m or "dreamy" in m)
                                 and "aggressive" not in m and "psychedelic" not in m)
def rule_all(m):         return True
# Preset-only tag, curated by hand in Komplett.xml: cosmic subject AND a
# slow character.  Deliberately NOT derived from calm/dreamy -- plenty of
# calm scenes are not space, and a few space ones (a black hole) are not
# calm but belong in the mood anyway.
def rule_space(m):       return "space" in m

# Preset-wide timing overrides (seconds): solo min/max, crossfade min/max.
# Absent = the engine's own 20..90 s scene / 15 s fade baseline.
TIMING = {
    "SpaceAmbient": (55, 150, 22, 45),
}

# (name, scene rule, hidden [, FX/transition rule])
# SpaceAmbient selects its SCENES by the curated `space` tag, but no FX or
# transition carries that tag -- filtering overlays by it would leave the
# preset with FxPlain and Crossfade alone.  Its overlays therefore use the
# ambient rule: calm or dreamy, never aggressive.
GENRES = [
    ("Ambient",     rule_ambient,     False),
    ("Club",        rule_club,        False),
    ("Noir",        rule_noir,        False),
    ("Psychedelic", rule_psychedelic, False),
    ("Galerie",     rule_galerie,     False),
    ("SpaceAmbient", rule_space,      False, rule_ambient),
    ("Allround",    rule_all,         False),
    ("TestAlle",    rule_all,         True),
]

src = open(SRC, encoding="utf-8").read()

# Whole entry blocks (open tag .. matching close tag): scenes, FX overlays
# and scene transitions alike.
BLOCK = re.compile(
    r"[ \t]*<(TextureShader|CombineShader|TransitionShader)\b[^>]*>.*?</\1>[ \t]*\n",
    re.S)
blocks = []
for m in BLOCK.finditer(src):
    tag = m.group(1)
    head = m.group(0).split(">", 1)[0]
    mm = re.search(r'mood="([^"]*)"', head)
    moods = set(t.strip() for t in mm.group(1).split(",")) if mm else set()
    fm = re.search(r'file="[^"]*[\\/](\w+)\.(?:frag)"', head)
    name = fm.group(1) if fm else "?"
    blocks.append((tag, name, moods, m.group(0)))

scenes = [b for b in blocks if b[0] == "TextureShader"]
fx     = [b for b in blocks if b[0] == "CombineShader"]
trans  = [b for b in blocks if b[0] == "TransitionShader"]
print("master: %d scenes, %d fx, %d transitions" % (len(scenes), len(fx), len(trans)))

# The two untagged workhorses must survive every mood filter: FxPlain is the
# resident pass-through overlay, Crossfade the fallback transition — a genre
# preset without either would break the 90%-Plain calibration (or fall back
# to the engine's built-in warning path).
ALWAYS = {"FxPlain", "Crossfade"}

for entry in GENRES:
    name, rule, hidden = entry[0], entry[1], entry[2]
    fxRule = entry[3] if len(entry) > 3 else rule
    sel_s = [b for b in scenes if rule(b[2])]
    sel_f = [b for b in fx    if fxRule(b[2]) or b[1] in ALWAYS]
    sel_t = [b for b in trans if fxRule(b[2]) or b[1] in ALWAYS]
    hid = ' hidden="true"' if hidden else ""
    tim = ""
    if name in TIMING:
        a, bb, c, d = TIMING[name]
        tim = (' timeTextureSoloMin="%d" timeTextureSoloMax="%d"'
               ' timeTextureInterpolationMin="%d" timeTextureInterpolationMax="%d"'
               % (a, bb, c, d))
    out = ['<?xml version="1.0" encoding="utf-8" ?>',
           '<configuration ImageDirectory="%s" ConfigurationName="%s"%s%s >'
           % (IMAGE_DIR, name, hid, tim),
           "",
           "  <!-- GENERATED by Tools/make_genre_configs.py from Komplett.xml -->",
           "  <!-- %d scenes + %d FX overlays + %d transitions, filtered by mood tags -->"
           % (len(sel_s), len(sel_f), len(sel_t)),
           ""]
    for b in sel_s + sel_f + sel_t:
        out.append(b[3].rstrip("\n"))
    out.append("")
    out.append("</configuration>")
    out.append("")
    path = "Configurations/%s.xml" % name
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print("%-12s %3d scenes  %2d fx  %2d trans -> %s"
          % (name, len(sel_s), len(sel_f), len(sel_t), path))
