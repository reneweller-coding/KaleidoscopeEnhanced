# -*- coding: utf-8 -*-
"""How often scenes come back in a long run: the scene scheduler simulated over days, without music.

Mirrors SceneScheduler's pick (Source/SceneScheduler.cpp, pickScene): a uniform random entry, refused during the
first two thirds of 300 tries if its shader file is in the no-repeat memory, then the probability roll (useShader)
and the mood test (about 0.6 without music).  With a lab share (labShare in the preset head) the walking chain labs
(lab file, morphP from 0.5) leave that pool: the lab clock (LongRunVariety.h, LabShareClock -- lab time against all
time, both decaying over three hours) calls a lab when the labs are behind their share, never two in a row and not
the last lab's file again.  A scene stays its entry's solo time (minTimeSolo..maxTimeSolo, default 20..90 s) plus a
fade (15..50 s).

  python Tools/long_run_sim.py                       # the genre presets, 72 h: as committed (HEAD) against now
  python Tools/long_run_sim.py Ambient,Club 48 7     # presets, hours, seed
  python Tools/long_run_sim.py --old-scheduler       # HEAD's presets under the scheduler before 16.10.2026
  python Tools/long_run_sim.py --real                # this model against the app's own scheduler

"HEAD" runs the presets as committed, "now" the working tree's, both under today's scheduler -- what a preset change
does.  "old" (--old-scheduler) is the scheduler before 16.10.2026: a memory of min(40, a third of the preset) scenes,
the labs ordinary entries.  hi/lo is the screen time a scene of interest >= 8 gets against one of interest <= 5
(Tools/preset_fit.tsv).  The run is a model, not the app: no music (no section or drop cuts, no taste), and the
complexity budget is left out.

--real puts the app itself beside it: Kaleidoscope.exe --schedule (Source/ScheduleSim.h) runs the real
SceneScheduler over the same hours of silence on a virtual clock, and the same statistics come from its plan.  Where
the two differ, the app is right; Tools/check_schedule.py checks that plan against the rules.
"""
import collections, io, math, os, random, re, statistics, subprocess, sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LABS = ("ChainLab2D", "ChainLab3D", "ChainLabTunnel", "ChainSlice3D")
GENRES = ("Ambient", "Club", "Noir", "Psychedelic", "Galerie", "SpaceAmbient", "Allround")
TAU = 3 * 3600.0


def interest():
    """interest per scene name from Tools/preset_fit.tsv."""
    lines = io.open(os.path.join(ROOT, "Tools", "preset_fit.tsv"), encoding="utf-8").read().splitlines()
    col = lines[0].split("\t").index("interest")
    return {v[0]: int(v[col]) for v in (ln.split("\t") for ln in lines[1:] if ln.strip())}


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
    stays = [(e[2] + e[3]) / 2.0 for e, l in zip(entries, is_lab) if l]
    lab_stay = sum(stays) / len(stays) if stays else 0.0     # LabShareClock::setLabStay()
    recent = collections.deque()
    t, seq = 0.0, []
    m_lab = m_all = 0.0
    act, last_lab = -1, ""
    while t < hours * 3600:
        want = False
        if labs:
            if act >= 0 and is_lab[act]:
                want = False
            elif m_all < 1:
                want = rnd.random() < share
            else:
                want = m_lab + (1 - share) * 0.3 * lab_stay < share * m_all
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
        seq.append((base, t, dur, is_lab[pick]))
        if is_lab[pick]:
            last_lab = base
        else:
            recent.append(base)
            while len(recent) > cap:
                recent.popleft()
        k_dec = math.exp(-dur / TAU)
        m_lab, m_all = m_lab * k_dec + (dur if is_lab[pick] else 0.0), m_all * k_dec + dur
        act = pick
        t += dur
    return summarize(seq, regular, cap, hours)


def summarize(seq, regular, cap, hours):
    """The statistics of a run: seq lists (shader file, time it came, seconds on screen, a scheduled lab)."""
    last_seen, gaps, shown, screen = {}, [], collections.Counter(), collections.Counter()
    lab_time = since_lab = longest_gap = 0.0
    first_repeat = None
    for base, t, dur, lab in seq:
        if lab:
            longest_gap = max(longest_gap, since_lab)
            since_lab = 0.0
        else:
            if base in last_seen:
                gaps.append((t - last_seen[base]) / 60.0)
                if first_repeat is None:
                    first_repeat = t / 60.0
            last_seen[base] = t
            shown[base] += 1
            screen[base] += dur
            since_lab += dur
        if base[:-5] in LABS:
            lab_time += dur
    total = sum(s[2] for s in seq)
    gaps.sort()
    day = shown and statistics.mean(shown.values()) * 24.0 / hours
    rating = interest()
    band = lambda keep: [screen.get(s, 0.0) for s in regular if s[:-5] in rating and keep(rating[s[:-5]])]
    hi, lo = band(lambda v: v >= 8), band(lambda v: v <= 5)
    hilo = statistics.mean(hi) / statistics.mean(lo) if hi and lo and statistics.mean(lo) > 0 else 0.0
    return {"changes": sum(shown.values()) / hours, "distinct": len(regular), "cap": cap,
            "per_day": day, "median": statistics.median(gaps) if gaps else 0, "p10": gaps[len(gaps) // 10] if gaps else 0,
            "first": first_repeat or 0, "labs": 100.0 * lab_time / total if total else 0.0,
            "nolab": longest_gap / 60.0, "hilo": hilo}


def real(preset, hours, seed):
    """The same statistics from the app's own scheduler (Kaleidoscope.exe --schedule, silence)."""
    out = os.path.join(ROOT, ".screen", "schedule", "%s_longrun.tsv" % preset)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    env = dict(os.environ, KALEIDO_SEED=str(seed))
    env["PATH"] = r"C:\Qt\6.11.1\msvc2022_64\bin" + os.pathsep + env.get("PATH", "")
    subprocess.run([os.path.join(ROOT, "Release", "Kaleidoscope.exe"), "--schedule", preset, "silence", "%g" % hours,
                    out], cwd=os.path.join(ROOT, "Release"), env=env, check=True, capture_output=True)
    entries, rows, share, cols = [], [], 0.0, None
    for line in io.open(out, encoding="utf-8"):
        v = line.rstrip("\n").split("\t")
        if v[0] == "# schedule":
            share = float(dict(x.split("=", 1) for x in v[1:])["labShare"])
        elif v[0] == "# entry":
            entries.append((v[2], v[5] == "1"))
        elif v[0] == "kind":
            cols = v
        elif cols and v[0] == "scene":
            rows.append(dict(zip(cols, v)))
    labs = set(f for f, lab in entries if lab) if share > 0 else set()
    regular = sorted(set(f for f, _ in entries) - labs)
    cap = min(len(regular) * 3 // 4, len(regular) - 2) if len(regular) > 2 else 0
    # a scene came when its solo began; it stood for the solo and the fade out (as the lab clock books it)
    seq = [(r["scene"], float(r["start"]) - float(r["solo"]), float(r["solo"]) + float(r["fade"]), r["scene"] in labs)
           for r in rows]
    return summarize(seq, regular, cap, hours)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    old_scheduler = "--old-scheduler" in sys.argv
    presets = args[0].split(",") if args else GENRES
    hours = float(args[1]) if len(args) > 1 else 72
    seed = int(args[2]) if len(args) > 2 else 1
    print("%-12s %-4s %5s %4s %5s %6s %7s %7s %7s %6s %6s %5s" % ("preset", "", "scenes", "mem", "ch/h", "x/day",
                                                                  "median", "10%", "first", "labs", "nolab", "hi/lo"))
    runs = (("old", True, True), ("now", False, False)) if old_scheduler else (("HEAD", True, False),
                                                                                ("now", False, False))
    if "--real" in sys.argv:
        runs = (("model", False, False), ("app", False, None))
    for p in presets:
        for label, head, old in runs:
            entries, share = load(p, head)
            r = real(p, hours, seed) if old is None else run(entries, share, hours, seed, old)
            print("%-12s %-4s %5d %4d %5.1f %6.2f %5.0f m %5.0f m %5.0f m %5.1f%% %4.0f m %5.2f"
                  % (p, label, r["distinct"], r["cap"], r["changes"], r["per_day"], r["median"], r["p10"], r["first"],
                     r["labs"], r["nolab"], r["hilo"]))
    print("\nscenes = hand-made shader files; mem = no-repeat memory; ch/h = hand-made scenes per hour; x/day = how "
          "often each comes per day;\nmedian / 10% = gap until a scene returns; first = first return of any scene; "
          "labs = share of the time; nolab = longest stretch without a lab;\nhi/lo = screen time of a scene of "
          "interest >= 8 against one of interest <= 5")


if __name__ == "__main__":
    main()
