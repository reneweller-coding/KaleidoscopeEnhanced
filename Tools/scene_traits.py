# -*- coding: utf-8 -*-
"""Was eine Szene IST, aus ihrem Quelltext abgeleitet -- fuer die Werkzeuge.

Dreimal an einem Tag hat sich gezeigt, dass Katalog und Screening nicht
wissen, womit sie es zu tun haben:

  * eine INSZENIERTE Szene (liest `sceneProgress`, oder ihr Rig nutzt
    `progress`) braucht Bilder bei Fortschritt 0.3 / 0.6 / 0.95, nicht bei
    t = 8 / 16 -- Assembly zeigte im Katalog nur seine Anflugphase;
  * eine TONHOEHEN-Szene (`audioPitch`, `audioMelody`, `audioDeltaPitch`)
    ist mit der Drone der Pruef-WAV blind -- MelodyScript mass leer, obwohl
    sie mit Musik eine leuchtende Handschrift schreibt.

Abgeleitet statt deklariert, damit nichts driftet; ein `@staged` oder
`@pitch` im Header zaehlt zusaetzlich, falls die Ableitung einmal daneben
liegt (z.B. eine Tonhoehe, die ueber eine Formel hereinkommt).

    python Tools/scene_traits.py            # Zusammenfassung
    python Tools/scene_traits.py --list     # jede Szene mit Merkmalen

Als Modul:  traits("Assembly") -> {"staged": True, "pitch": False}
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ("Scene2D", "Scene3D")
EXTS = (".frag", ".vert", ".geom", ".tesc", ".tese", ".comp")
KOMPLETT = os.path.join(ROOT, "Presets", "Komplett.xml")

PITCH = re.compile(r"\b(audioPitch|audioMelody|audioMelodyHead|audioDeltaPitch)\b|@pitch\b")
STAGED = re.compile(r"\bsceneProgress\b|@staged\b")

_cache = {}
_rig_progress = None


def _rig_progress_names():
    """Szenen, deren Rig-Formeln in Komplett.xml `progress` verwenden."""
    global _rig_progress
    if _rig_progress is not None:
        return _rig_progress
    names = set()
    if os.path.exists(KOMPLETT):
        src = io.open(KOMPLETT, encoding="utf-8", errors="replace").read()
        for m in re.finditer(r'<TextureShader\b[^>]*file="[^"]*[\\/]([A-Za-z0-9_]+)\.frag"'
                             r'.*?</TextureShader>', src, re.S):
            if re.search(r'formula="[^"]*\bprogress\b', m.group(0)):
                names.add(m.group(1))
    _rig_progress = names
    return names


def sources(name):
    out = []
    for d in DIRS:
        for e in EXTS:
            p = os.path.join(ROOT, d, name + e)
            if os.path.exists(p):
                out.append(p)
    return out


def traits(name):
    if name in _cache:
        return _cache[name]
    text = "".join(io.open(p, encoding="utf-8", errors="replace").read()
                   for p in sources(name))
    t = {
        "staged": bool(STAGED.search(text)) or name in _rig_progress_names(),
        "pitch": bool(PITCH.search(text)),
    }
    _cache[name] = t
    return t


def all_scenes():
    seen = set()
    for d in DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for fn in os.listdir(base):
            if fn.endswith(".frag"):
                seen.add(fn[:-5])
    return sorted(seen)


def main():
    names = all_scenes()
    rows = [(n, traits(n)) for n in names]
    staged = [n for n, t in rows if t["staged"]]
    pitch = [n for n, t in rows if t["pitch"]]
    if "--list" in sys.argv:
        for n, t in rows:
            tags = [k for k in ("staged", "pitch") if t[k]]
            if tags:
                print("%-40s %s" % (n, " ".join(tags)))
    print("%d Szenen: %d inszeniert (sceneProgress/progress), %d tonhoehengetrieben"
          % (len(rows), len(staged), len(pitch)))
    print("inszeniert:", ", ".join(staged))
    print("Tonhoehe:  ", ", ".join(pitch))
    return 0


if __name__ == "__main__":
    sys.exit(main())
