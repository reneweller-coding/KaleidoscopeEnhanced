# -*- coding: utf-8 -*-
r"""Folds what the viewer told the app into the genre presets: Tools/user_taste.tsv from kaleidoscope_settings.ini.

The app learns a taste per preset and scene (RenderPipeline::bumpTaste): skipping a scene multiplies its weight by 0.8,
marking it a favourite by 1.25, and "never show again" bans it.  That stays in the viewer's own settings file and only
steers that one installation.  This tool turns it into a correction of Tools/preset_fit.tsv, which
Tools/make_genre_configs.py reads, so the presets that are generated (and shipped) follow it:

    python Tools/apply_taste.py                 # show what the settings file says (dry run)
    python Tools/apply_taste.py --write         # write Tools/user_taste.tsv, then run make_genre_configs.py
    python Tools/apply_taste.py --ini <file>    # another settings file (an installed copy, a second machine)
    python Tools/apply_taste.py --merge         # keep the rows already in user_taste.tsv, add the new ones

A taste belongs to a preset, so it corrects that genre's fit column, not the scene as a whole: a scene skipped twice
in Ambient loses a step in `ambient` and keeps its place in Psychedelic.  A taste learnt in Allround corrects
`interest`.  One skip (0.8) is not a verdict -- people skip to look around -- so the steps start at two:

    weight <= 0.65 (two skips)   -1        weight >= 1.25 (one favourite)    +1
    weight <= 0.42 (four skips)  -2        weight >= 1.55 (two favourites)   +2
    banned                       fit 0 in that genre (Allround: interest 1, which keeps it out of every genre)

Test benches and presets that no longer exist (TestAlle, Komplett, Modelle ...) are ignored: walking a bench from A
to Z leaves a trail of skips that says nothing.  The weights fade by 3 % per start of the app, so an old verdict
wears off by itself; the file written here does not fade and is under version control.
"""
import argparse
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Tools", "user_taste.tsv")
COLUMN = {"Ambient": "ambient", "SpaceAmbient": "space", "Club": "club", "Noir": "noir", "Psychedelic": "psychedelic",
          "Electronic": "electronic", "Psytrance": "psytrance", "Cinematic": "cinematic", "Downtempo": "downtempo",
          "Allround": "interest"}


def read_ini(path):
    """Reads the taste, banned and marked groups of a settings file.

    @param path  The settings file. (in)

    @return
      A list of (preset, scene, kind, value): kind is "taste" (value = the weight) or "banned".
    """
    rows, section = [], None
    for line in io.open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        m = re.match(r"\[(.+)\]$", line)
        if m:
            section = m.group(1)
            continue
        if section not in ("taste", "banned") or "=" not in line:
            continue
        key, value = line.rsplit("=", 1)
        parts = re.split(r"[\\/]", key)
        if len(parts) != 2:
            continue
        scene = re.sub(r"\.frag$", "", parts[1])
        if section == "banned":
            if value.strip().lower() == "true":
                rows.append((parts[0], scene, "banned", 0.0))
        else:
            try:
                rows.append((parts[0], scene, "taste", float(value)))
            except ValueError:
                pass
    return rows


def step(weight):
    """The correction a learnt weight stands for.

    @param weight  The taste weight, 0.3 .. 2.5 (1 = neutral). (in)

    @return
      The steps to add to the rating, -2 .. 2.
    """
    if weight <= 0.42:
        return -2
    if weight <= 0.65:
        return -1
    if weight >= 1.55:
        return 2
    if weight >= 1.25:
        return 1
    return 0


def main():
    """Reads the settings file, prints the corrections and writes them on request.

    @return
      The process exit code.
    """
    ap = argparse.ArgumentParser()
    ap.add_argument("--ini", default=os.path.join(ROOT, "kaleidoscope_settings.ini"))
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--merge", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(a.ini):
        print("no settings file:", a.ini)
        return 1
    rows = read_ini(a.ini)
    out, ignored, weak = {}, {}, 0
    if a.merge and os.path.exists(OUT):
        for ln in io.open(OUT, encoding="utf-8").read().splitlines()[1:]:
            v = ln.split("\t")
            if len(v) >= 4:
                out[(v[0], v[1])] = (v[2], v[3])
    for preset, scene, kind, value in rows:
        col = COLUMN.get(preset)
        if not col:
            ignored[preset] = ignored.get(preset, 0) + 1
            continue
        if kind == "banned":
            out[(scene, col)] = ("ban", "%s banned" % preset)
            continue
        d = step(value)
        if d == 0:
            weak += 1
            continue
        if out.get((scene, col), ("",))[0] != "ban":
            out[(scene, col)] = ("%+d" % d, "%s %.2f" % (preset, value))
    print("%s: %d entries read; %d corrections, %d single skips or faded weights left alone" % (os.path.basename(a.ini), len(rows), len(out), weak))
    if ignored:
        print("ignored (no genre preset): " + ", ".join("%s %d" % kv for kv in sorted(ignored.items())))
    for (scene, col), (d, why) in sorted(out.items()):
        print("  %-40s %-12s %-4s (%s)" % (scene, col, d, why))
    if not a.write:
        print("dry run -- --write stores it in Tools/user_taste.tsv and rebuilds the presets")
        return 0
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("name\tcolumn\tstep\tsource\n")
        for (scene, col), (d, why) in sorted(out.items()):
            f.write("%s\t%s\t%s\t%s\n" % (scene, col, d, why))
    print("written:", OUT)
    import subprocess
    return subprocess.call([sys.executable, os.path.join(ROOT, "Tools", "make_genre_configs.py")], cwd=ROOT)


if __name__ == "__main__":
    sys.exit(main())
