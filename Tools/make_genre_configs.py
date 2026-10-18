# -*- coding: utf-8 -*-
"""Regenerate the genre presets from Komplett.xml.

Komplett.xml is the master list: every scene and FX entry lives there with
its mood tags, formulas and parameter ranges.  This tool filters that master
by mood into the genre configurations, so adding a scene to Komplett (with
moods) and re-running this script is all it takes to roll it out everywhere.

    python Tools/make_genre_configs.py          (run from the repo root)

Genres. SCENES of the genre presets are chosen by rated fit
(Tools/preset_fit.tsv, see select_by_fit below): at least 400 distinct scenes
each, best fit first, dull ones last. The mood rules below still pick the FX
overlays and transitions, and the scenes nobody has rated yet:
    Ambient      calm or dreamy, never aggressive -- music without a beat
    Downtempo    calm, dreamy or bright, never aggressive -- the slow beat:
                 chillout, trip-hop, lounge
    SpaceAmbient the hand-curated `space` tag: ships, worlds, deep sky --
                 long scene times and long crossfades (see TIMING)
    Cinematic    calm, bright or dreamy, never aggressive or psychedelic --
                 classical, film music, piano: landscapes, architecture,
                 painting, slow flights; long scenes and long fades
    Club         aggressive, or bright without calm
    Electronic   aggressive, energetic, bright or psychedelic, never calm --
                 by its own rating column the synthetic look: grids,
                 lasers, neon, spectra, data, tunnels, hard geometry
    Psytrance    psychedelic, aggressive or energetic, never calm -- the
                 driving psychedelic look: tunnels, fractal flights,
                 kaleidoscopes, hard patterns
    Psychedelic  psychedelic
    Noir         dark
    Allround     everything, every model variant

Komplett.xml itself stays hidden: it is the master, not a show.
"""
import re, os, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SRC = "Presets/Komplett.xml"
# Relative to the executable's working directory (bin/), exactly like the
# shader paths ("..\\\\Scene2D\\\\X.frag").  The bundled photo library lives in
# Images/ beside Presets/; a user who wants their own pictures sets
# imageDirectory in kaleidoscope_settings.ini instead of editing generated
# files, which this script would overwrite on its next run.
IMAGE_DIR = "..\\\\Images"

# Every rule takes (moods, head): the mood set, and the entry's opening tag.
# Most only need the moods, but "loads a real 3D model" is a property of the
# tag (geom="mesh") and no mood can stand in for it.
def rule_ambient(m, h):     return ("calm" in m or "dreamy" in m) and "aggressive" not in m
def rule_club(m, h):        return "aggressive" in m or ("bright" in m and "calm" not in m)
def rule_electronic(m, h):  return bool(m & {"aggressive", "energetic", "bright", "psychedelic"}) and "calm" not in m
def rule_noir(m, h):        return "dark" in m
def rule_psychedelic(m, h): return "psychedelic" in m
def rule_cinematic(m, h):   return (("calm" in m or "bright" in m or "dreamy" in m)
                                    and "aggressive" not in m and "psychedelic" not in m)
def rule_downtempo(m, h):   return bool(m & {"calm", "dreamy", "bright"}) and "aggressive" not in m
def rule_psytrance(m, h):   return bool(m & {"psychedelic", "aggressive", "energetic"}) and "calm" not in m
def rule_all(m, h):         return True
# Preset-only tag, curated by hand in Komplett.xml: cosmic subject AND a
# slow character.  Deliberately NOT derived from calm/dreamy -- plenty of
# calm scenes are not space, and a few space ones (a black hole) are not
# calm but belong in the mood anyway -- as long as they are not aggressive.
# Not aggressive (14.09.2026): 59 of 257 space entries were -- a gamma-ray
# burst, a planetary collision, a racing flight -- and a calm space preset
# is exactly where they do not fit.
def rule_space(m, h):       return "space" in m and "aggressive" not in m

# Preset-wide timing overrides (seconds): solo min/max, crossfade min/max.
# Absent = the engine's own 20..90 s scene / 15 s fade baseline.
# These four numbers are the PHOTO pacing -- background-image solo min/max and
# cross-fade min/max, in seconds. They are NOT the scene times: those live on
# the individual entries (minTimeSolo/maxTimeSolo). An earlier revision set
# the review bench (TestAlle, retired 18.10.2026) to (8, 9, 1, 2) here in
# the belief it was stating the scene time in the file -- what it actually did was rotate the background photograph every
# 8-9 s with a snappy 1-2 s fade, downbeat-quantised like the scene changes
# and at nearly their period, so the photo swap drifted onto the seconds right
# AFTER each scene change. The scene's palette and the exposure both follow
# the photograph, so every such swap read as the fresh scene abruptly changing
# brightness -- reported three times before the cause was this line.
TIMING = {
    "SpaceAmbient": (55, 150, 22, 45),
    # Long photo stretches under long scenes: a picture is part of the mood here.
    "Cinematic": (50, 140, 20, 40),
}

# Floor on every natural scene fade (seconds), written as timeSceneFadeMin.
# With a beat in the music the scheduler clamps fades to four beats (2 s at
# 120 BPM), which is right for a club preset and wrong for a calm one: the
# user found transitions "very, very fast" in Ambient and SpaceAmbient
# (14.09.2026). A preset with a floor also never hard-cuts on a drop.
SCENE_FADE_MIN = {
    "Ambient": 5,
    "SpaceAmbient": 6,
    "Cinematic": 6,
    "Downtempo": 4,
}

# (name, scene rule, hidden [, FX/transition rule])
# SpaceAmbient selects its SCENES by the curated `space` tag, but no FX or
# transition carries that tag -- filtering overlays by it would leave the
# preset with FxPlain and Crossfade alone.  Its overlays therefore use the
# ambient rule: calm or dreamy, never aggressive.
CHAIN_LABS = ("ChainLab2D", "ChainLab3D", "ChainLabTunnel", "ChainSlice3D")
# ---- Long walking lab stays (16.10.2026) ------------------------------------
# "Visualisations that run for hours, better days, without the same scenes
# coming back" (user, 16.10.2026).  The hand-made scenes run out -- some 400 per
# preset, each back two or three times a day -- the chain labs never do, but
# they were one entry among 400 and got about one percent of the time.  Each
# genre preset therefore gives its walking labs a share of the screen time
# (LAB_SHARE, written as labShare: the scheduler's lab clock calls a lab when
# the labs are behind, never two in a row -- values chosen by the user) and
# replaces its lab entries by genre variants (LAB_FLAVOURS): the lab files with
# the genre's knob ranges.  The walk keeps to an entry's ranges
# (EffectShader::resetChainWalk), and the classes are sorted calm .. wild, so a
# range is a character: Ambient walks the calm three fifths, Club the wild
# half, Cinematic stays with the photo and the relief look.  Every variant walks
# (morphP 0.5..1) and stays LAB_STAY seconds; their probabilities only weigh
# the variants against each other (which lab, when the clock calls one).
LAB_SHARE = {"Psychedelic": 0.50, "SpaceAmbient": 0.40, "Club": 0.40, "Allround": 0.35, "Ambient": 0.35,
             "Noir": 0.25, "Electronic": 0.30, "Psytrance": 0.45, "Downtempo": 0.30, "Cinematic": 0.15}
LAB_STAY = {"Ambient": (360, 900), "SpaceAmbient": (420, 1080), "Club": (240, 600), "Psychedelic": (300, 900),
            "Noir": (300, 720), "Allround": (300, 900), "Electronic": (240, 600), "Psytrance": (240, 600),
            "Downtempo": (300, 780), "Cinematic": (300, 720)}
# The characters: knob ranges as fractions of the energy-sorted class lists
# (chainAP..chainDP the 2D chain, spaceP/coreP/bodyP the 3D world, styleP the
# look: photo | relief | contour lines | flow | glowing edges) and of the plain
# knobs (speedP flow speed, paletteP photo colours .. colour field, glowP the
# afterglow from 0.15 up, detailP texture sharpness).  A knob an entry does not
# have is skipped.
CALM = {"chainAP": ("0", "0.6"), "chainBP": ("0", "0.65"), "chainCP": ("0", "0.6"), "chainDP": ("0", "0.6"),
        "spaceP": ("0", "0.7"), "coreP": ("0", "0.65"), "bodyP": ("0", "0.7"),
        "styleP": ("0", "0.8"), "speedP": ("0", "0.4"), "glowP": ("0.2", "1")}
WILD = {"chainAP": ("0.35", "1"), "chainBP": ("0.3", "1"), "chainCP": ("0.3", "1"), "chainDP": ("0.35", "1"),
        "spaceP": ("0.3", "1"), "coreP": ("0.35", "1"),
        "styleP": ("0.4", "1"), "speedP": ("0.5", "1"), "glowP": ("-0.6", "0.5"), "paletteP": ("0.3", "1")}
FULL = {}
COLOUR = {"paletteP": ("0.35", "1"), "glowP": ("0", "1")}
SPACE = {"chainAP": ("0", "0.75"), "chainDP": ("0", "0.7"), "styleP": ("0", "0.8"), "speedP": ("0", "0.35"),
         "glowP": ("0", "1")}
NOIR = {"styleP": ("0", "0.6"), "paletteP": ("0", "0.35"), "speedP": ("0", "0.6"), "glowP": ("-0.6", "0.6")}
# The photograph stays recognisable (Cinematic) -- photo and relief look,
# photo colours, sharp texture, and the classes before the openings (the
# tunnel-like chainAP classes sit in its upper third, chainCP spiral and
# tunnel at its end); no tunnel lab.
PHOTO = {"chainAP": ("0", "0.7"), "chainCP": ("0", "0.85"), "chainDP": ("0", "0.7"), "styleP": ("0", "0.4"),
         "paletteP": ("0", "0.35"), "detailP": ("0.5", "1"), "speedP": ("0", "0.5"), "glowP": ("-0.6", "0.4")}
# (lab, probability, ranges, extra mood tag, colour grade)
LAB_FLAVOURS = {
    "Ambient": [("ChainLab2D", 0.5, CALM, "calm", ""), ("ChainLabTunnel", 0.35, CALM, "calm", ""),
                ("ChainLab3D", 0.4, CALM, "calm", ""), ("ChainSlice3D", 0.25, CALM, "calm", "")],
    "SpaceAmbient": [("ChainLab3D", 0.6, SPACE, "calm", ""), ("ChainSlice3D", 0.45, SPACE, "calm", ""),
                     ("ChainLabTunnel", 0.3, dict(CALM, speedP=("0", "0.35")), "calm", ""),
                     ("ChainLab2D", 0.2, dict(CALM, speedP=("0", "0.35")), "calm", "")],
    "Club": [("ChainLab2D", 0.5, WILD, "aggressive", ""), ("ChainLabTunnel", 0.45, WILD, "aggressive", ""),
             ("ChainLab3D", 0.4, WILD, "aggressive", ""), ("ChainSlice3D", 0.25, WILD, "aggressive", "")],
    # Electronic: the wild half, its flow quick and its colours past the photo's own.
    "Electronic": [("ChainLab2D", 0.5, dict(WILD, paletteP=("0.4", "1")), "energetic", ""),
                   ("ChainLabTunnel", 0.45, WILD, "energetic", ""), ("ChainLab3D", 0.4, WILD, "energetic", ""),
                   ("ChainSlice3D", 0.3, WILD, "energetic", "")],
    "Psychedelic": [("ChainLab2D", 0.5, COLOUR, "", ""), ("ChainLab2D", 0.3, WILD, "aggressive", ""),
                    ("ChainLabTunnel", 0.4, COLOUR, "", ""), ("ChainLab3D", 0.4, COLOUR, "", ""),
                    ("ChainSlice3D", 0.35, COLOUR, "", "")],
    "Noir": [("ChainLab2D", 0.5, NOIR, "dark", "fade,grey,sepia"),
             ("ChainLabTunnel", 0.35, NOIR, "dark", "fade,grey,sepia"),
             ("ChainLab3D", 0.4, NOIR, "dark", "fade,grey,sepia")],
    "Cinematic": [("ChainLab2D", 0.6, PHOTO, "calm", ""), ("ChainLab3D", 0.35, PHOTO, "calm", "")],
    # Psytrance: the wild half in full colour; the tunnel lab most of all.
    "Psytrance": [("ChainLabTunnel", 0.5, dict(WILD, paletteP=("0.35", "1")), "", ""),
                  ("ChainLab2D", 0.5, dict(WILD, paletteP=("0.35", "1")), "", ""),
                  ("ChainLab3D", 0.4, WILD, "", ""), ("ChainSlice3D", 0.3, WILD, "", "")],
    # Downtempo: the calm classes, but colourful and flowing.
    "Downtempo": [("ChainLab2D", 0.5, dict(CALM, paletteP=("0.2", "1")), "calm", ""),
                  ("ChainLabTunnel", 0.3, CALM, "calm", ""), ("ChainLab3D", 0.4, CALM, "calm", ""),
                  ("ChainSlice3D", 0.25, CALM, "calm", "")],
    "Allround": [("ChainLab2D", 0.45, FULL, "", ""), ("ChainLabTunnel", 0.4, FULL, "", ""),
                 ("ChainLab3D", 0.4, FULL, "", ""), ("ChainSlice3D", 0.35, FULL, "", "")],
}

GENRES = [
    ("Ambient",     rule_ambient,     False),
    ("Downtempo",   rule_downtempo,   False),
    ("SpaceAmbient", rule_space,      False, rule_ambient),
    ("Cinematic",   rule_cinematic,   False),
    ("Club",        rule_club,        False),
    ("Electronic",  rule_electronic,  False),
    ("Psytrance",   rule_psytrance,   False),
    ("Psychedelic", rule_psychedelic, False),
    ("Noir",        rule_noir,        False),
    ("Allround",    rule_all,         False),
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
    blocks.append((tag, name, moods, m.group(0), head))

scenes = [b for b in blocks if b[0] == "TextureShader"]
fx     = [b for b in blocks if b[0] == "CombineShader"]
trans  = [b for b in blocks if b[0] == "TransitionShader"]
print("master: %d scenes, %d fx, %d transitions" % (len(scenes), len(fx), len(trans)))

def lab_flavour(genre, lab, prob, ranges, mood_tag, grade):
    """One genre variant of a chain lab (LAB_FLAVOURS): the master entry with the variant's knob ranges, always
    walking, staying LAB_STAY[genre] seconds -- as a block tuple like the parsed ones."""
    base = [b for b in scenes if b[1] == lab]
    if not base:
        sys.exit("make_genre_configs: %s is not in %s" % (lab, SRC))
    blk = base[0][3].rstrip("\n")
    for knob, (lo, hi) in dict(ranges, morphP=("0.5", "1")).items():
        blk = re.sub(r'(<float name="%s") minValue="[^"]*" maxValue="[^"]*"' % knob,
                     r'\1 minValue="%s" maxValue="%s"' % (lo, hi), blk)
    head = blk.split(">", 1)[0]
    new_head = re.sub(r'probability="[^"]*"', 'probability="%.3g"' % prob, head, count=1)
    moods = set(base[0][2])
    if mood_tag and mood_tag not in moods:
        new_head = re.sub(r'mood="', 'mood="%s,' % mood_tag, new_head, count=1)
        moods.add(mood_tag)
    attrs = ('grade="%s" ' % grade if grade else "") + 'minTimeSolo="%d" maxTimeSolo="%d" ' % LAB_STAY[genre]
    new_head = new_head.replace("<TextureShader ", "<TextureShader " + attrs, 1)
    return ("TextureShader", lab, moods, new_head + blk[len(head):] + "\n", new_head)

# A knob named in a variant must exist on some lab (a typo would silently leave the range open).
_lab_knobs = set(re.findall(r'<float name="(\w+)"', "".join(b[3] for b in scenes if b[1] in CHAIN_LABS)))
for _genre, _variants in LAB_FLAVOURS.items():
    for _v in _variants:
        _bad = set(_v[2]) - _lab_knobs
        if _bad or _v[0] not in CHAIN_LABS:
            sys.exit("make_genre_configs: LAB_FLAVOURS[%s] names %s" % (_genre, sorted(_bad) or _v[0]))

# The two untagged workhorses must survive every mood filter: FxPlain is the
# resident pass-through overlay, Crossfade the fallback transition — a genre
# preset without either would break the 90%-Plain calibration (or fall back
# to the engine's built-in warning path).
ALWAYS = {"FxPlain", "Crossfade"}

# ---- Scene choice by rated fit (29.09.2026) -------------------------------
# The mood rules alone left Club with 372 scenes, Psychedelic with 331 and
# SpaceAmbient with 114 -- and "every preset at least 400 different scenes"
# was the brief. Tools/preset_fit.tsv holds a hand rating of every scene
# (contact sheet of the three catalogue frames + header + measured luma,
# saturation, motion): fit 0..10 per genre preset and a genre-free
# "interest" 0..10 (how spectacular and filmic it is -- slow staged
# object scenes and near-black frames rate low).
#
# Per genre: rank = fit + INTEREST_WEIGHT * (interest - 5) (+ a second
# genre for SpaceAmbient, whose fillers should at least be ambient). Every
# scene ranked >= RANK_TAKE goes in; the rest by rank until MIN_SCENES
# DISTINCT scenes are reached, skipping dull ones (interest <= DULL) as long
# as anything else is left -- a near-black scene with a good fit on paper
# is still a near-black scene. The counts below are distinct shaders, not
# entries: a mesh family registers one entry per model (ShipFlyby 29), so
# at most MAX_VARIANTS of its entries are carried, spread over its models,
# or one family would crowd out everything else.
#
# A scene missing from the table (added after the rating) falls back to
# the mood rule of its genre until someone rates it.
FIT_FILE = "Tools/preset_fit.tsv"
FIT_COLUMN = {"Ambient": "ambient", "SpaceAmbient": "space", "Club": "club",
              "Noir": "noir", "Psychedelic": "psychedelic", "Electronic": "electronic",
              "Psytrance": "psytrance", "Cinematic": "cinematic", "Downtempo": "downtempo"}
MIN_SCENES = 400
RANK_TAKE = 6.0
FIT_FLOOR = 3          # never fill with a scene rated below this, even short of MIN_SCENES
DULL = 2
INTEREST_WEIGHT = 0.15
SECOND_FIT = {"SpaceAmbient": ("ambient", 0.4)}
# Colour grade per preset: a scene that is in the preset only as filler (its fit
# for the genre at or below the limit -- typically a colourful scene in Noir,
# which must reach MIN_SCENES) wears one of these looks there, rolled per
# activation and applied by Present.frag (EffectShader::setGradeModes).
GRADE = {"Noir": (5, "fade,grey,sepia")}
MAX_VARIANTS = 6

# ---- Screen time by show value (16.10.2026) ---------------------------------
# With the no-repeat memory the probability roll and the taste hardly change how
# often a scene comes (simulated: p >= 0.7 against p <= 0.25 3.2:1 without the
# memory, 1.6:1 with it), so a rating has to act on how LONG a scene stays --
# the one lever that turns it into screen time without bringing scenes back
# sooner.  Each scene of a genre preset gets its solo time from its show value
# v = interest + SOLO_FIT * (fit - 7): the mean doubles every SOLO_DOUBLING
# points, scaled per preset so that the mean over its entries stays the old
# default's 55 s (20..90 s) -- the same number of changes an hour; the range is
# SOLO_SPREAD around that mean.  The labs keep LAB_STAY, an entry with its own
# minTimeSolo keeps it; the scheduler stretches the stay by the learned taste.
SOLO_GENRES = set(FIT_COLUMN) | {"Allround"}
SOLO_MEAN = 55.0
# Per preset where the mean differs: Cinematic lets a scene breathe like a shot in a film.
SOLO_MEAN_BY = {"Cinematic": 80.0}
SOLO_DOUBLING = 1.6
SOLO_FIT = 0.5
SOLO_SPREAD = (0.55, 1.45)
SOLO_LIMITS = (14.0, 160.0)

fit = {}
if os.path.exists(FIT_FILE):
    lines = open(FIT_FILE, encoding="utf-8").read().splitlines()
    head = lines[0].split("\t")
    for ln in lines[1:]:
        if ln.strip():
            v = ln.split("\t")
            fit[v[0]] = {head[i]: int(v[i]) for i in range(1, min(len(head), len(v))) if v[i].strip()}

def select_by_fit(genre, rule):
    col = FIT_COLUMN[genre]
    shaders = []
    for b in scenes:
        if b[1] not in shaders:
            shaders.append(b[1])
    rated = [s for s in shaders if s in fit and col in fit[s]]
    second = SECOND_FIT.get(genre)
    def rank(s):
        r = fit[s][col] + INTEREST_WEIGHT * (fit[s]["interest"] - 5)
        if second:
            r += second[1] * (fit[s][second[0]] - 5)
        return r
    chosen = {s for s in rated if rank(s) >= RANK_TAKE and fit[s][col] >= FIT_FLOOR
              and fit[s]["interest"] > DULL}
    for dull_ok in (False, True):
        for s in sorted(rated, key=rank, reverse=True):
            if len(chosen) >= MIN_SCENES:
                break
            if fit[s][col] >= FIT_FLOOR and (dull_ok or fit[s]["interest"] > DULL):
                chosen.add(s)
    # Unrated scenes (or unrated in this genre's column): the old mood rule decides.
    chosen |= {b[1] for b in scenes if (b[1] not in fit or col not in fit[b[1]]) and rule(b[2], b[4])}
    sel = []
    for s in shaders:
        if s not in chosen:
            continue
        entries = [b for b in scenes if b[1] == s]
        if len(entries) > MAX_VARIANTS:
            n = len(entries)
            entries = [entries[round(i * (n - 1) / (MAX_VARIANTS - 1))] for i in range(MAX_VARIANTS)]
        sel.extend(entries)
    return sel

def solo_times(genre, sel):
    """Solo time (min, max) in seconds per scene name for one genre preset (SOLO_GENRES; see above)."""
    col = FIT_COLUMN.get(genre)
    own = [b for b in sel if b[0] == "TextureShader" and b[1] not in CHAIN_LABS and "minTimeSolo=" not in b[4]]
    if not own:
        return {}
    def value(s):
        if s not in fit or (col and col not in fit[s]):
            return None
        return fit[s]["interest"] + (SOLO_FIT * (fit[s][col] - 7) if col else 0.0)
    known = sorted(v for v in (value(b[1]) for b in own) if v is not None)
    middle = known[len(known) // 2] if known else 6.5
    raw = [2.0 ** (((value(b[1]) if value(b[1]) is not None else middle) - 6.5) / SOLO_DOUBLING) for b in own]
    target = SOLO_MEAN_BY.get(genre, SOLO_MEAN)
    k = target
    for _ in range(6):  # the limits pull the mean; a few rounds bring it back to the target
        means = [min(max(k * r, SOLO_LIMITS[0]), SOLO_LIMITS[1]) for r in raw]
        k *= target / (sum(means) / len(means))
    return {b[1]: (round(SOLO_SPREAD[0] * m), round(SOLO_SPREAD[1] * m)) for b, m in zip(own, means)}

for entry in GENRES:
    name, rule, hidden = entry[0], entry[1], entry[2]
    fxRule = entry[3] if len(entry) > 3 else rule
    if name in FIT_COLUMN and fit:
        sel_s = select_by_fit(name, rule)
    else:
        sel_s = [b for b in scenes if rule(b[2], b[4])]
    # The genre's lab variants take the place of the plain lab entries.
    labs = [lab_flavour(name, *v) for v in LAB_FLAVOURS.get(name, [])]
    if labs:
        sel_s = [b for b in sel_s if b[1] not in CHAIN_LABS] + labs
    sel_f = [b for b in fx    if fxRule(b[2], b[4]) or b[1] in ALWAYS]
    sel_t = [b for b in trans if fxRule(b[2], b[4]) or b[1] in ALWAYS]
    hid = ' hidden="true"' if hidden else ""
    tim = ""
    if name in TIMING:
        a, bb, c, d = TIMING[name]
        tim = (' timeTextureSoloMin="%d" timeTextureSoloMax="%d"'
               ' timeTextureInterpolationMin="%d" timeTextureInterpolationMax="%d"'
               % (a, bb, c, d))
    if name in SCENE_FADE_MIN:
        tim += ' timeSceneFadeMin="%d"' % SCENE_FADE_MIN[name]
    if name in LAB_SHARE:
        tim += ' labShare="%.2f"' % LAB_SHARE[name]
    out = ['<?xml version="1.0" encoding="utf-8" ?>',
           '<configuration ImageDirectory="%s" ConfigurationName="%s"%s%s >'
           % (IMAGE_DIR, name, hid, tim),
           "",
           "  <!-- GENERATED by Tools/make_genre_configs.py from Komplett.xml -->",
           "  <!-- %d scenes + %d FX overlays + %d transitions, filtered by mood tags -->"
           % (len(sel_s), len(sel_f), len(sel_t)),
           ""]
    if labs:
        out[-1:-1] = ["  <!-- %d walking chain lab variants (LAB_FLAVOURS), %d %% of the screen time (labShare) -->"
                      % (len(labs), round(100 * LAB_SHARE.get(name, 0)))]
    graded = 0
    solo = solo_times(name, sel_s) if name in SOLO_GENRES else {}
    for b in sel_s + sel_f + sel_t:
        blk = b[3].rstrip("\n")
        if (name in GRADE and b[0] == "TextureShader" and b[1] in fit and 'grade="' not in b[4]
                and fit[b[1]][FIT_COLUMN[name]] <= GRADE[name][0]):
            blk = blk.replace("<TextureShader ", '<TextureShader grade="%s" ' % GRADE[name][1], 1)
            graded += 1
        # The show value goes along (interest="..."): the scheduler's spectacle reserve rolls a drop's target
        # from the scenes of interest >= 8 (SceneScheduler::pickSpectacle).
        if b[0] == "TextureShader" and b[1] in fit and 'interest="' not in b[4]:
            blk = blk.replace("<TextureShader ", '<TextureShader interest="%d" ' % fit[b[1]]["interest"], 1)
        if b[0] == "TextureShader" and b[1] in solo and "minTimeSolo=" not in b[4]:
            blk = blk.replace("<TextureShader ", '<TextureShader minTimeSolo="%d" maxTimeSolo="%d" ' % solo[b[1]], 1)
        out.append(blk)
    if graded:
        print("%-12s %3d scenes wear a colour grade (%s)" % (name, graded, GRADE[name][1]))
    out.append("")
    out.append("</configuration>")
    out.append("")
    path = "Presets/%s.xml" % name
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print("%-12s %3d scenes  %2d fx  %2d trans%s -> %s"
          % (name, len(sel_s), len(sel_f), len(sel_t),
             "  (%d lab variants, %d %% labs)" % (len(labs), round(100 * LAB_SHARE[name])) if labs else "", path))
