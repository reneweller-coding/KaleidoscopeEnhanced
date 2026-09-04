#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Verify mood-tag coverage and cross-preset consistency.

    python Tools/check_mood_tags.py            # check
    python Tools/check_mood_tags.py --sync     # repair drift from the master

The mood tags live on every shader entry in every Presets/*.xml, and
SceneScheduler::moodAccept reads them from whichever preset is ACTIVE. That
design has a failure mode: edit a tag in one preset and every other preset
keeps the old value. It happened — the measured tag-audit campaign corrected
the main presets while Neu.xml kept 86 stale pre-audit tags, so the mood bias
worked everywhere except in that one preset.

Rules enforced:
  * every TextureShader/CombineShader entry carries a mood attribute
    (transitions: all but Crossfade, the deliberately neutral default;
    TestAlle's pass-through FX entry is exempt for the same reason)
  * the RUNTIME flags (dark/bright/calm/aggressive — the only ones the engine
    consumes; see EffectShader::moodFlags) of every entry match the entry for
    the same shader file in Komplett.xml, the reference catalogue
  * preset-only tags (psychedelic, dreamy, ...) are NOT synced: they encode
    preset membership and may legitimately differ per preset

--sync rewrites the runtime subset of each drifting entry from the master,
preserving the entry's preset-only tags and everything else byte-for-byte.

Exit code 1 on any finding, so this can gate a commit.
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "Presets")
MASTER = "Komplett.xml"
RUNTIME = ("dark", "bright", "calm", "aggressive")   # engine order is irrelevant; ours is stable

ENTRY = re.compile(r"<(TextureShader|CombineShader|TransitionShader)\b[^>]*")


def base_of(entry):
    """Normalised RELATIVE path (dir/name), not the basename: the catalogue has
    shaders that share a basename across directories (Scene2D/CrystalGrowth vs
    Scene3D/CrystalGrowth, Scene2D/VoronoiShatter vs Transitions/...). Keying
    on the basename made the first version of this script conflate them and
    "sync" two different shaders onto one tag set."""
    m = re.search(r'file="([^"]+)"', entry)
    if not m:
        return None
    p = m.group(1).replace("\\\\", "\\").replace("\\", "/")
    parts = [x for x in p.split("/") if x not in ("..", ".", "")]
    return "/".join(parts[-2:]) if len(parts) >= 2 else parts[-1]


def mood_of(entry):
    m = re.search(r'mood="([^"]*)"', entry)
    if not m:
        return None
    return [t.strip() for t in m.group(1).split(",") if t.strip()]


def runtime_set(tags):
    return frozenset(t for t in tags if t in RUNTIME)


def load_master():
    s = io.open(os.path.join(CFG, MASTER), encoding="utf-8", errors="replace").read()
    out = {}
    for m in ENTRY.finditer(s):
        b = base_of(m.group(0))
        tags = mood_of(m.group(0))
        if b and tags is not None:
            out[b] = tags
    return out


def main():
    sync = "--sync" in sys.argv
    master = load_master()
    problems = []
    fixed = 0

    for path in sorted(glob.glob(os.path.join(CFG, "*.xml"))):
        name = os.path.basename(path)
        raw = io.open(path, "rb").read()
        crlf = raw.count(b"\r\n") > 0
        s = raw.decode("utf-8", "replace").replace("\r\n", "\n")
        changed = False

        def fix(m):
            nonlocal changed, fixed
            entry = m.group(0)
            b = base_of(entry)
            tags = mood_of(entry)
            if tags is None:
                # untagged: only the neutral defaults may be
                if os.path.basename(b or "") not in ("Crossfade.frag", "FxPlain.frag"):
                    problems.append("%s: %s has no mood attribute" % (name, b))
                return entry
            if name == MASTER or b not in master:
                return entry
            want = runtime_set(master[b])
            have = runtime_set(tags)
            if want == have:
                return entry
            if not sync:
                problems.append("%s: %s runtime flags [%s] differ from master [%s]"
                                % (name, b, ",".join(sorted(have)), ",".join(sorted(want))))
                return entry
            # rebuild: master's runtime tokens in master order, then this
            # entry's preset-only tokens in their original order
            merged = [t for t in master[b] if t in RUNTIME] \
                   + [t for t in tags if t not in RUNTIME]
            changed = True
            fixed += 1
            return re.sub(r'mood="[^"]*"', 'mood="%s"' % ",".join(merged), entry)

        s2 = ENTRY.sub(fix, s)
        if sync and changed:
            data = (s2.replace("\n", "\r\n") if crlf else s2).encode("utf-8")
            io.open(path, "wb").write(data)
            print("synced %s" % name)

    if sync:
        print("%d entries rewritten from the master" % fixed)
        return 0
    if problems:
        print("mood tags: %d problem(s)" % len(problems))
        for p in problems[:20]:
            print("  * %s" % p)
        if len(problems) > 20:
            print("  ... and %d more" % (len(problems) - 20))
        print("\nRun with --sync to take the runtime flags from %s." % MASTER)
        return 1
    print("mood tags OK: full coverage, no runtime-flag drift against %s" % MASTER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
