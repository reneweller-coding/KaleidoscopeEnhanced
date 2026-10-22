# -*- coding: utf-8 -*-
"""The audio analysis against the generators' score cues: how many sections and drops it finds, and how many it invents.

    python Tools/analyser_vs_cues.py                      # every <name>.cues.tsv + <name>.wav under G:/Tools/VRAudio
    python Tools/analyser_vs_cues.py DIR_OR_CUES_FILE ... # those
    python Tools/analyser_vs_cues.py @set.txt             # the cue files listed in set.txt (a frozen set)
    python Tools/analyser_vs_cues.py --detail ...         # one line per track as well

The generators of the family (Phosphene, Parhelion, Totality, Skybreak, Nacreous, Ephemeris, Analemma, ...) write the
cues of every rendered demo beside it: where each section starts, of which kind, and where the drops land.  For the
analyser that is a labelled test set -- the sections and drops it has to guess from the loudspeaker output, written
down by the program that composed them.  Each WAV goes through `PresetEditor --features` (the analyser at full speed,
every 50 ms; a copy as 16-bit PCM in .screen/cuebench first, which the reader needs), and:

  sections  a cue boundary (after the first 12 s, while the analyser's averages settle) is found if the analyser
            starts a section from 2 s before to 6 s after it; an analyser section is invented if no cue boundary lies
            from 6 s before to 2 s after it
  drops     a cue drop is found if the analyser drops from 2 s before to 4 s after it; an analyser drop is invented if
            no cue drop lies from 4 s before to 2 s after it
  either    what the scene changes follow: a cue boundary met by a section or a drop, as for sections

found / invented per kind of section (a break, a build, a drop ...) and in total.  Nothing is changed; the numbers are
the baseline any change to AudioAnalyzer's section or drop detection is measured against.
"""
import csv
import glob
import io
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDITOR = os.path.join(ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe")
QT_BIN = r"C:\Qt\6.11.1\msvc2022_64\bin"
CACHE = os.path.join(ROOT, ".screen", "cuebench")
DEFAULT = r"G:/Tools/VRAudio"
WARM = 12.0


def find_pairs(args):
    """(cue file, wav) pairs under the directories or cue files given."""
    files = []
    for a in args or [DEFAULT]:
        if a.startswith("@"):                      # a list file: one cue file per line (a frozen benchmark set)
            files += [l.strip() for l in io.open(a[1:], encoding="utf-8") if l.strip()]
        elif os.path.isdir(a):
            files += glob.glob(os.path.join(a, "**", "*.cues.tsv"), recursive=True)
        else:
            files.append(a)
    pairs = []
    for c in sorted(set(os.path.abspath(f) for f in files)):
        w = c[:-len(".cues.tsv")] + ".wav"
        if os.path.exists(w):
            pairs.append((c, w))
    return pairs


def read_cues(path):
    """[(seconds, kind)] of the sections and [seconds] of the drops."""
    sections, drops = [], []
    for line in io.open(path, encoding="utf-8"):
        p = line.rstrip("\r\n").split("\t")
        if line.startswith("#") or len(p) < 2:
            continue
        if p[1].endswith("/section") or p[1].endswith("/block") or p[1].endswith("/phase") or p[1].endswith("/scene"):
            sections.append((float(p[0]), p[2].split()[0] if len(p) > 2 and p[2] else "?"))
        elif p[1].endswith("/drop"):
            drops.append(float(p[0]))
    return sections, drops


def analyse(wav):
    """The analyser's section and drop times, and the track's length."""
    os.makedirs(CACHE, exist_ok=True)
    key = "%s_%s" % (os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(wav)))),
                     os.path.splitext(os.path.basename(wav))[0])
    pcm = os.path.join(CACHE, key + ".wav")
    feat = os.path.join(CACHE, key + ".csv")
    if not os.path.exists(feat) or os.path.getmtime(feat) < os.path.getmtime(EDITOR):
        if not os.path.exists(pcm):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "pcm_s16le", pcm], check=True)
        env = dict(os.environ, PATH=QT_BIN + os.pathsep + os.environ.get("PATH", ""))
        subprocess.run([EDITOR, "--features", pcm, feat, "--every", "5"], cwd=os.path.dirname(EDITOR), env=env,
                       capture_output=True, check=True)
    secs, drops, last_s, last_d, t = [], [], 0, 0, 0.0
    for r in csv.DictReader(io.open(feat, encoding="utf-8")):
        t = float(r["t"])
        s, d = int(r["sections"]), int(r["drops"])
        if s > last_s:
            secs.append(t)
        if d > last_d:
            drops.append(t)
        last_s, last_d = s, d
    return secs, drops, t


def near(t, events, before, after):
    """Whether an event lies from `before` seconds before t to `after` seconds after it."""
    return any(t - before <= e <= t + after for e in events)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    detail = "--detail" in sys.argv
    pairs = find_pairs(args)
    if not pairs:
        sys.exit("analyser_vs_cues: no <name>.cues.tsv beside a <name>.wav")
    kinds = {}
    tot = dict(sec_cues=0, sec_found=0, sec_ana=0, sec_inv=0, drop_cues=0, drop_found=0, drop_ana=0, drop_inv=0,
               any_found=0, any_ana=0, any_inv=0)
    for cues_path, wav in pairs:
        sections, drops = read_cues(cues_path)
        a_secs, a_drops, length = analyse(wav)
        a_secs = [a for a in a_secs if a >= WARM]
        bounds = [(t, k) for t, k in sections if t >= WARM]
        found = [(t, k) for t, k in bounds if near(t, a_secs, 2.0, 6.0)]
        inv = [a for a in a_secs if not near(a, [t for t, _ in sections], 6.0, 2.0)]
        d_found = [t for t in drops if near(t, a_drops, 2.0, 4.0)]
        d_inv = [a for a in a_drops if not near(a, drops, 4.0, 2.0)]
        # what the scheduler cuts on: a section or a drop, against every cue boundary (a drop is one too)
        a_any = sorted(a_secs + [d for d in a_drops if d >= WARM])
        any_found = [(t, k) for t, k in bounds if near(t, a_any, 2.0, 6.0)]
        any_inv = [a for a in a_any if not near(a, [t for t, _ in sections] + drops, 6.0, 2.0)]
        for t, k in bounds:
            kk = kinds.setdefault(k, [0, 0])
            kk[0] += 1
            kk[1] += 1 if (t, k) in found else 0
        for key, v in (("sec_cues", len(bounds)), ("sec_found", len(found)), ("sec_ana", len(a_secs)),
                       ("sec_inv", len(inv)), ("drop_cues", len(drops)), ("drop_found", len(d_found)),
                       ("drop_ana", len(a_drops)), ("drop_inv", len(d_inv)), ("any_found", len(any_found)),
                       ("any_ana", len(a_any)), ("any_inv", len(any_inv))):
            tot[key] += v
        if detail:
            name = os.path.relpath(cues_path, os.path.commonpath([p[0] for p in pairs]) if len(pairs) > 1
                                   else os.path.dirname(cues_path))
            print("%-58s %4.0f s  sections %2d/%2d found, %2d of %2d invented   drops %d/%d found, %d of %d invented"
                  % (name[:58], length, len(found), len(bounds), len(inv), len(a_secs), len(d_found), len(drops),
                     len(d_inv), len(a_drops)))
    pct = lambda a, b: 100.0 * a / b if b else 0.0
    print("%d tracks" % len(pairs))
    print("sections: %d of %d cue boundaries found (%.0f %%); %d of the analyser's %d invented (%.0f %%)"
          % (tot["sec_found"], tot["sec_cues"], pct(tot["sec_found"], tot["sec_cues"]), tot["sec_inv"], tot["sec_ana"],
             pct(tot["sec_inv"], tot["sec_ana"])))
    print("drops:    %d of %d cue drops found (%.0f %%); %d of the analyser's %d invented (%.0f %%)"
          % (tot["drop_found"], tot["drop_cues"], pct(tot["drop_found"], tot["drop_cues"]), tot["drop_inv"],
             tot["drop_ana"], pct(tot["drop_inv"], tot["drop_ana"])))
    print("either:   %d of %d cue boundaries met by a section or a drop (%.0f %%); %d of %d invented (%.0f %%)"
          % (tot["any_found"], tot["sec_cues"], pct(tot["any_found"], tot["sec_cues"]), tot["any_inv"],
             tot["any_ana"], pct(tot["any_inv"], tot["any_ana"])))
    print("found by the kind of section the cue names:")
    for k, (n, f) in sorted(kinds.items(), key=lambda kv: -kv[1][0]):
        print("  %-10s %3d of %3d  (%.0f %%)" % (k, f, n, pct(f, n)))


if __name__ == "__main__":
    main()
