# -*- coding: utf-8 -*-
"""The scene plan of a long run, computed by the real scheduler, against the standing rules.

    python Tools/check_schedule.py                        # the genre presets: 12 h of silence, 6 h of music each
    python Tools/check_schedule.py Club,Ambient 24        # presets, hours of silence (music: half of it)
    python Tools/check_schedule.py --quick                # 6 h + 6 h (release_check's step "schedule")
    python Tools/check_schedule.py --audio song.wav Club  # this 16-bit WAV as the music, looped
    python Tools/check_schedule.py --tsv plan.tsv         # check a plan written before

Kaleidoscope.exe --schedule (Source/ScheduleSim.h) runs SceneScheduler on a virtual clock -- the conditioner, the
scheduler's tick and its combine half, the labs' walk decision, no window -- and writes every change with its
reason.  The music is Tools/make_structure_wav.py's track (groove, build-up, vacuum, drop, three times; 128 BPM),
which makes drops, sections and phrases; silence runs on the solo times alone.  The rules checked:

  entries  the solo ranges the app read are the preset's (minTimeSolo/maxTimeSolo, absent: 20..90 s), and so are
           the transitions' minFade and the preset's timeSceneFadeMin and labShare
  solo     every planned solo is a roll of its entry: solo_planned x timing (1 for a walking lab) within
           minTimeSolo..maxTimeSolo -- the taste is neutral in this run
  stay     a change by the timer came after the planned solo, and at most the downbeat wait later (2.5 s; 33 beats
           when the phrase held it); a drop cut not before 2 s on screen, a section or harmonic cut not before 4 s
           (20 s in a calm preset)
  labs     never two walking labs in a row from a roll, in a preset with a lab share
  share    the labs' share of the screen time (solo and fade out, as the lab clock books it) within 3 points of
           labShare, in runs of 6 hours or more
  floor    every natural fade (timer; a musical trigger in a calm preset) at least max(timeSceneFadeMin, the
           transition's minFade); a calm preset never cuts (no "music" or "drop" change) and no fade there ends
           sooner than timeSceneFadeMin

Exit code 1 on any violation.  Each run's TSV stays in .screen/schedule/ for a look.
"""
import collections
import io
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE = os.path.join(ROOT, "Release", "Kaleidoscope.exe")
QT_BIN = r"C:\Qt\6.11.1\msvc2022_64\bin"
OUTDIR = os.path.join(ROOT, ".screen", "schedule")
GENRES = ("Ambient", "Club", "Noir", "Psychedelic", "Galerie", "SpaceAmbient", "Allround")
STRUCTURE = os.path.join(ROOT, ".screen", "structure128.wav")


def schedule(preset, audio, hours, out):
    """Kaleidoscope.exe --schedule; returns its summary line."""
    env = dict(os.environ)
    env["PATH"] = QT_BIN + os.pathsep + env.get("PATH", "")
    p = subprocess.run([EXE, "--schedule", preset, audio, "%g" % hours, out], cwd=os.path.dirname(EXE), env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=3600)
    if p.returncode != 0:
        raise RuntimeError("--schedule %s %s: rc %d\n%s" % (preset, audio, p.returncode, p.stderr[-800:]))
    return p.stdout.strip().splitlines()[-1]


def read_plan(path):
    """The head (preset, entries, transitions) and the rows of a plan."""
    head, entries, trans, rows = {}, [], {}, []
    cols = None
    for line in io.open(path, encoding="utf-8"):
        v = line.rstrip("\n").split("\t")
        if v[0] == "# schedule":
            head = dict(x.split("=", 1) for x in v[1:])
        elif v[0] == "# entry":
            entries.append({"file": v[2], "min": int(v[3]), "max": int(v[4]), "lab": v[5] == "1",
                            "interest": int(v[6])})
        elif v[0] == "# transition":
            trans[v[2]] = float(v[3])
        elif v[0] == "kind":
            cols = v
        elif cols:
            rows.append(dict(zip(cols, v)))
    return head, entries, trans, rows


def xml_entries(preset_file):
    """The preset's own numbers, read as Configuration reads them (Source/Configuration.cpp)."""
    root = ET.parse(os.path.join(ROOT, "Presets", preset_file)).getroot()
    scenes = []
    for el in root.iter("TextureShader"):
        lo = int(el.get("minTimeSolo", "0") or 0) or 20
        hi = int(el.get("maxTimeSolo", "0") or 0)
        if hi <= lo:
            hi = 90 if lo == 20 else lo + 1
        scenes.append((re.split(r"[\\/]", el.get("file", ""))[-1], lo, hi))
    fades = {}
    for el in root.iter("TransitionShader"):
        fades[re.split(r"[\\/]", el.get("file", ""))[-1]] = float(el.get("minFade", "0") or 0)
    return (scenes, fades, float(root.get("timeSceneFadeMin", "0") or 0), float(root.get("labShare", "0") or 0))


def check(path):
    """The rules against one plan; returns (summary, violations)."""
    head, entries, trans, rows = read_plan(path)
    bad = collections.defaultdict(list)
    fps = float(head.get("fps", 60))
    frame = 1.0 / fps
    fade_min = float(head["sceneFadeMin"])
    share_want = float(head["labShare"])
    calm = fade_min > 0
    hours = float(head["hours"])

    # entries: what the app read, against the preset file
    scenes, fades, x_fade_min, x_share = xml_entries(head["file"])
    if abs(x_fade_min - fade_min) > 1e-3 or abs(x_share - share_want) > 1e-3:
        bad["entries"].append("timeSceneFadeMin/labShare %g/%g in the file, %g/%g read"
                              % (x_fade_min, x_share, fade_min, share_want))
    k = 0
    for e in entries:
        while k < len(scenes) and scenes[k][0] != e["file"]:
            k += 1                                       # an entry the loader skipped (a mesh without its model)
        if k == len(scenes):
            bad["entries"].append("%s: not in the file's order" % e["file"])
            break
        if (scenes[k][1], scenes[k][2]) != (e["min"], e["max"]):
            bad["entries"].append("%s: %d..%d in the file, %d..%d read" % (e["file"], scenes[k][1], scenes[k][2],
                                                                           e["min"], e["max"]))
        k += 1
    for name, m in trans.items():
        if name in fades and abs(fades[name] - m) > 1e-3:
            bad["entries"].append("%s: minFade %g in the file, %g read" % (name, fades[name], m))

    by_file = collections.defaultdict(list)
    for e in entries:
        by_file[e["file"]].append(e)
    lab_files = set(e["file"] for e in entries if e["lab"])
    whys = collections.Counter()
    lab_secs = all_secs = 0.0
    scene_rows = [r for r in rows if r["kind"] == "scene"]
    for r in scene_rows:
        why, f = r["why"], r["scene"]
        whys[why] += 1
        planned, solo, timing = float(r["solo_planned"]), float(r["solo"]), float(r["timing"])
        fade_planned, fade = float(r["fade_planned"]), float(r["fade"])
        at = "%s at %.0f s" % (f, float(r["start"]))

        # solo: a roll inside the entry's range (several entries may share a file: any of them)
        raw = planned * (1.0 if r["walk"] == "1" else timing)
        if not any(e["min"] - 0.01 <= raw <= e["max"] + 0.01 for e in by_file[f]):
            bad["solo"].append("%s: planned %.1f s (x %.3f = %.1f), range %s" % (
                at, planned, timing, raw, ", ".join("%d..%d" % (e["min"], e["max"]) for e in by_file[f])))

        # stay
        if why == "timer":
            # held at most until the downbeat wait gave up (2.5 s), or 33 beats where the phrase could hold it -- the
            # scheduler reports which (hold), and a hold is never longer than 33 beats at the slowest tempo
            wait, hold = solo - planned, float(r["hold"])
            if wait < -2 * frame or wait > hold + 3 * frame or hold > 33 * 60.0 / 40.0 + 0.01:
                bad["stay"].append("%s: on screen %.2f s for a planned %.2f s (hold %.2f s)" % (at, solo, planned,
                                                                                                hold))
            # a change on the phrase starts with four beats left (its four-beat fade ends on the boundary)
            bpm = float(r["bpm"])
            if r["phrase"] == "1" and bpm > 0:
                beats = float(r["phrase_left"]) * bpm / 60.0
                if not 3.0 - 0.1 < beats <= 4.0 + 0.1:
                    bad["stay"].append("%s: on the phrase with %.2f beats left" % (at, beats))
        elif why in ("music", "drop", "music-calm"):
            # a drop may cut after 2 s; a section or a harmonic jump within 4 s of a change was answered by it
            least = 20.0 if calm else 4.0 if why == "music" else 2.0
            if solo < least - frame:
                bad["stay"].append("%s: cut (%s) after %.2f s, before %.0f s" % (at, why, solo, least))

        # labs
        if share_want > 0 and r["how"] == "roll" and f in lab_files and r["next"] in lab_files:
            bad["labs"].append("%s -> %s" % (at, r["next"]))
        on_screen = solo + fade
        all_secs += on_screen
        if f in lab_files:
            lab_secs += on_screen

        # floor
        if why in ("timer", "music-calm"):
            floor = max(fade_min, trans.get(r["transition"], 0.0))
            if fade_planned < floor - 1e-3:
                bad["floor"].append("%s: fade %.2f s via %s, floor %.2f s" % (at, fade_planned, r["transition"],
                                                                               floor))
        if calm and why in ("music", "drop"):
            bad["floor"].append("%s: a %s cut in a calm preset" % (at, why))
        if calm and fade < fade_min - 2 * frame:
            bad["floor"].append("%s: the fade ended after %.2f s, timeSceneFadeMin %.0f s" % (at, fade, fade_min))

    share = lab_secs / all_secs if all_secs else 0.0
    if share_want > 0 and hours >= 6 and abs(share - share_want) > 0.03:
        bad["share"].append("labs %.1f %% of the screen time, asked %.0f %%" % (100 * share, 100 * share_want))
    on_phrase = sum(1 for r in scene_rows if r["phrase"] == "1")
    drops = [r for r in scene_rows if r["why"] == "drop"]
    summary = "%-12s %-17s %5.1f h %5d changes (%s)  labs %4.1f %% of %2.0f %%  phrase %d  drop cuts %d (%d on a " \
              "spectacle)" % (head["preset"], head["audio"], hours, len(scene_rows),
                              " ".join("%s %d" % kv for kv in sorted(whys.items())), 100 * share, 100 * share_want,
                              on_phrase, len(drops), sum(1 for r in drops if r["how"] == "spectacle"))
    return summary, bad


def main():
    opts, args, it = sys.argv[1:], [], iter(sys.argv[1:])
    for a in it:
        if a in ("--audio", "--tsv"):
            next(it, None)                                   # its value is not a preset
        elif not a.startswith("--"):
            args.append(a)
    if "--tsv" in opts:
        plans = [opts[opts.index("--tsv") + 1]]
    else:
        quick = "--quick" in opts
        presets = args[0].split(",") if args else GENRES
        hours = float(args[1]) if len(args) > 1 else (6.0 if quick else 12.0)
        music_hours = 6.0 if quick and len(args) < 2 else hours / 2.0
        if "--audio" in opts:
            music = os.path.abspath(opts[opts.index("--audio") + 1])
        else:
            music = STRUCTURE
            if not os.path.exists(music):
                os.makedirs(os.path.dirname(music), exist_ok=True)
                subprocess.run([sys.executable, os.path.join(ROOT, "Tools", "make_structure_wav.py"), music],
                               check=True, cwd=ROOT, stdout=subprocess.DEVNULL)
        os.makedirs(OUTDIR, exist_ok=True)
        plans = []
        for p in presets:
            for audio, h in (("silence", hours), (music, music_hours)):
                tag = "silence" if audio == "silence" else os.path.splitext(os.path.basename(audio))[0]
                out = os.path.join(OUTDIR, "%s_%s.tsv" % (p, tag))
                schedule(p, audio, h, out)
                plans.append(out)
    failed = 0
    for path in plans:
        summary, bad = check(path)
        n = sum(len(v) for v in bad.values())
        print(("FAIL " if n else "ok   ") + summary)
        for rule, items in sorted(bad.items()):
            for item in items[:6]:
                print("       %-7s %s" % (rule, item))
            if len(items) > 6:
                print("       %-7s ... and %d more" % (rule, len(items) - 6))
        failed += 1 if n else 0
    print("schedule: %d plan(s), %d with violations" % (len(plans), failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
