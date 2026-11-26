# -*- coding: utf-8 -*-
"""Rebuild generated scenes and take over only what changed in their sources -- not the generator's drift.

    python Tools/scenegen/merge_regen.py Name [Name ...]          # write Scene2D|FX/<Name>.frag
    python Tools/scenegen/merge_regen.py --check Name [Name ...]  # only say what would change
    python Tools/scenegen/merge_regen.py --base REF Name ...      # the frag of REF's source is the base (default HEAD:
                                                                  # after the source change was committed, its parent)

A full gen.py rebuild of an older scene pulls in everything the shared libraries gained since it was last built (the
2D chain scenes of 30.09. get some 1,070 lines of round-7 chain classes they never call) -- a larger shader to compile
and a diff nobody can review.  This builds each scene twice with today's gen.py, once from its source as committed
(git HEAD) and once from its source as it is now, and merges the difference between the two into the committed frag
(git merge-file): the frag gains exactly the hunks the source change makes, and its drift stays as it was.  A scene
whose committed frag is what gen.py writes anyway gets the plain rebuild.  Conflicts are reported, nothing is written
for them.
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SP, "..", ".."))
sys.path.insert(0, SP)
import gen  # noqa: E402


def built(name, sp=None):
    """gen.py's text of <name>.frag (laid out as gen.build() writes it), from the sources in sp/src (default: SP)."""
    old = gen.SP
    if sp:
        gen.SP = sp
    try:
        folder, text = gen.assemble(name)
    finally:
        gen.SP = old
    path = os.path.join(ROOT, folder, name + ".frag")
    return path, gen._cgvr.layout_and_names(text, path)


def head_source(name, tmp, ref="HEAD"):
    """The source of <name> at ref (a git revision) into tmp/src; False if it has none there."""
    rel = "Tools/scenegen/src/%s.glsl" % name
    p = subprocess.run(["git", "show", ref + ":" + rel], cwd=ROOT, capture_output=True)
    if p.returncode != 0:
        return False
    os.makedirs(os.path.join(tmp, "src"), exist_ok=True)
    io.open(os.path.join(tmp, "src", name + ".glsl"), "wb").write(p.stdout)
    return True


def main():
    args = sys.argv[1:]
    check = "--check" in args
    ref = "HEAD"
    if "--base" in args:
        i = args.index("--base")
        ref = args[i + 1]
        del args[i:i + 2]
    names = [a for a in args if not a.startswith("--")]
    tmp = tempfile.mkdtemp(prefix="merge_regen_")
    bad = 0
    try:
        for n in names:
            path, new = built(n)
            cur = io.open(path, encoding="utf-8").read() if os.path.exists(path) else None
            if not head_source(n, tmp, ref) or cur is None:
                what, out = "new (plain build)", new
            else:
                _, base = built(n, tmp)
                if base == cur:
                    what, out = "plain rebuild (no drift)", new
                elif base == new:
                    what, out = "source unchanged", cur
                else:
                    files = [os.path.join(tmp, n + x) for x in (".cur", ".base", ".new")]
                    for f, t in zip(files, (cur, base, new)):
                        io.open(f, "w", encoding="utf-8", newline="\n").write(t)
                    p = subprocess.run(["git", "merge-file", "-p", files[0], files[1], files[2]], capture_output=True)
                    if p.returncode != 0:
                        print("%-28s CONFLICT (%d) -- left alone" % (n, p.returncode))
                        bad += 1
                        continue
                    what, out = "merged (drift kept)", p.stdout.decode("utf-8")
            changed = out != cur
            print("%-28s %s%s" % (n, what, "" if changed else ", unchanged"))
            if changed and not check:
                io.open(path, "w", encoding="utf-8", newline="\n").write(out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
