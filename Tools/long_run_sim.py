# -*- coding: utf-8 -*-
"""How often scenes come back in a long run: the scene scheduler simulated over days, without music.

Mirrors SceneScheduler's pick (Source/SceneScheduler.cpp, pickScene): a uniform random entry, refused during the
first two thirds of 300 tries if its shader file is in the no-repeat memory, then the probability roll (useShader)
and the mood test (about 0.6 without music).  With a lab share (labShare in the preset head) the walking chain labs
(lab file, morphP from 0.5) leave that pool: the lab clock (LongRunVariety.h, LabShareClock -- lab time against all
time, both decaying over three hours) calls a lab when the labs are behind their share, never two in a row and not
the last lab's file again.  A scene stays its entry's solo time (minTimeSolo..maxTimeSolo, default 20..90 s) plus a
fade (15..50 s).

  python Tools/long_run_sim.py                       # the genre presets, 72 h, the new scheduler against the old
  python Tools/long_run_sim.py Ambient,Club 48 7     # presets, hours, seed

"old" is the scheduler before 16.10.2026: a memory of min(40, a third of the preset) scenes, the labs ordinary
entries; it is run on the presets as committed in HEAD.  The run is a model, not the app: no music (no section or
drop cuts, no taste), and the complexity budget is left out.
"""
import collections, io, math, os, random, re, statistics, subprocess, sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LABS = ("ChainLab2D", "ChainLab3D", "ChainLabTunnel", "ChainSlice3D")
GENRES = ("Ambient", "Club", "Noir", "Psychedelic", "Galerie", "SpaceAmbient", "Allround")
TAU = 3 * 3600.0


def load(preset, head):
    """The scene entries of a preset (working tree, or HEAD for the old scheduler) and its lab share."""
    if head:
        text = subprocess.run(["git", "show", "HEAD:Presets/%s.xml" % preset], cwd=ROOT, capture_output=True,
                              encoding="utf-8").stdout
    else:
        text = io.open(os.path.join(ROOT, "Presets", preset + ".xml"), encoding="utf-8").read()
    root = ET.fromstring(text)
    out = []
    for el in root.iter("TextureShader"):
        base = re.split(r"[\\/]", el.get("file", ""))[-1]
        mi = int(el.get("minTimeSolo", "0") or 0) or 20
        ma = int(el.get("maxTimeSolo", "0") or 0)
        if ma <= mi:
            ma = 90 if mi == 20 else mi + 1
        morph = [f for f in el.iter("float") if f.get("name") == "morphP"]
        walking = base[:-5] in LABS and bool(morph) and float(morph[0].get("minValue")) >= 0.5
        out.append((base, float(el.get("probability", "1")), mi, ma, walking))
    return out, float(root.get("labShare", "0") or 0)


def run(entries, share, hours, seed, old):
    rnd = random.Random(seed)
    n = len(entries)
    if old:
        share = 0.0
    labs = share > 0 and any(e[4] for e in entries)
    is_lab = [labs and e[4] for e in entries]
    regular = sorted(set(e[0] for e, l in zip(entries, is_lab) if not l))
    cap = min(40, n // 3) if old else (min(len(regular) * 3 // 4, len(regular) - 2) if len(regular) > 2 else 0)
    lab_files = len(set(e[0] for e, l in zip(entries, is_lab) if l))
    recent = collections.deque()
    t, last_seen, gaps, shown = 0.0, {}, [], collections.Counter()
    m_lab = m_all = 0.0
    lab_time, act, last_lab, since_lab, longest_gap = 0.0, -1, "", 0.0, 0.0
    first_repeat = None
    while t < hours * 3600:
        want = False
        if labs:
            if act >= 0 and is_lab[act]:
                want = False
            elif m_all < 1:
                want = rnd.random() < share
            else:
                want = m_lab < share * m_all
        pool = [i for i in range(n) if is_lab[i] == want] if labs else list(range(n))
        pick = None
        for i in range(300):
            k = rnd.choice(pool)
            if i < 200 and ((want and lab_files > 1 and entries[k][0] == last_lab) or
                            (not want and entries[k][0] in recent)):
                continue
            if k == act:
                continue
            if rnd.random() <= entries[k][1] and rnd.random() < 0.6:
                pick = k
                break
        if pick is None:
            pick = k
        base, p, mi, ma, walking = entries[pick]
        dur = rnd.uniform(mi, ma) + rnd.uniform(15, 50)
        if is_lab[pick]:
            last_lab = base
            longest_gap = max(longest_gap, since_lab)
            since_lab = 0.0
        else:
            if base in last_seen:
                gaps.append((t - last_seen[base]) / 60.0)
                if first_repeat is None:
                    first_repeat = t / 60.0
            last_seen[base] = t
            shown[base] += 1
            recent.append(base)
            while len(recent) > cap:
                recent.popleft()
            since_lab += dur
        if base[:-5] in LABS:
            lab_time += dur
        k_dec = math.exp(-dur / TAU)
        m_lab, m_all = m_lab * k_dec + (dur if is_lab[pick] else 0.0), m_all * k_dec + dur
        act = pick
        t += dur
    gaps.sort()
    day = shown and statistics.mean(shown.values()) * 24.0 / hours
    return {"changes": sum(shown.values()) / hours, "distinct": len(regular), "cap": cap,
            "per_day": day, "median": statistics.median(gaps) if gaps else 0, "p10": gaps[len(gaps) // 10] if gaps else 0,
            "first": first_repeat or 0, "labs": 100.0 * lab_time / t, "nolab": longest_gap / 60.0}


def main():
    presets = sys.argv[1].split(",") if len(sys.argv) > 1 else GENRES
    hours = float(sys.argv[2]) if len(sys.argv) > 2 else 72
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    print("%-12s %-3s %5s %4s %5s %6s %7s %7s %7s %6s %6s" % ("preset", "", "scenes", "mem", "ch/h", "x/day",
                                                               "median", "10%", "first", "labs", "nolab"))
    for p in presets:
        for old in (True, False):
            entries, share = load(p, old)
            r = run(entries, share, hours, seed, old)
            print("%-12s %-3s %5d %4d %5.1f %6.2f %5.0f m %5.0f m %5.0f m %5.1f%% %4.0f m"
                  % (p, "old" if old else "new", r["distinct"], r["cap"], r["changes"], r["per_day"], r["median"],
                     r["p10"], r["first"], r["labs"], r["nolab"]))
    print("\nscenes = hand-made shader files; mem = no-repeat memory; ch/h = hand-made scenes per hour; x/day = how "
          "often each comes per day;\nmedian / 10% = gap until a scene returns; first = first return of any scene; "
          "labs = share of the time; nolab = longest stretch without a lab")


if __name__ == "__main__":
    main()
