# -*- coding: utf-8 -*-
"""Finish a block of new scenes: register in Komplett.xml, add ratings to
preset_fit.tsv, add them to RECENT_SCENES (TestNeu), regenerate presets and
run the checks.
Usage: finish_block.py "Name|mood,mood|complexity|amb space club noir psy gal interest" ..."""
import os, re, subprocess, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SP = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
REPL = [a for a in sys.argv[1:] if a == "--replace"]
rows = [a.split("|") for a in sys.argv[1:] if not a.startswith("--")]
# 1. register (--replace: rebuilt scenes swap their old entry)
subprocess.run([sys.executable, os.path.join(SP, "register_new.py")] + REPL + ["%s:%s:%s" % (r[0], r[1], r[2]) for r in rows], check=True)
# 2. ratings (existing rows are overwritten)
p = "Tools/preset_fit.tsv"
lines = open(p, encoding="utf-8").read().rstrip("\n").split("\n")
have = {l.split("\t")[0] for l in lines}
for r in rows:
    new = "\t".join([r[0]] + r[3].split())
    if r[0] in have:
        lines = [new if l.split("\t")[0] == r[0] else l for l in lines]
    else:
        lines.append(new)
open(p, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
# 3. TestNeu list
g = "Tools/make_genre_configs.py"
t = open(g, encoding="utf-8").read()
i = t.index("RECENT_SCENES = {")
j = t.index("\n}", i)
names = [r[0] for r in rows if ('"%s"' % r[0]) not in t[i:j]]
if names:
    line = "    " + ", ".join('"%s"' % n for n in names) + ",\n"
    t = t[:j + 1] + line + t[j + 1:]
    open(g, "w", encoding="utf-8", newline="\n").write(t)
# 4. regenerate + checks
out = subprocess.run([sys.executable, "Tools/make_genre_configs.py"], capture_output=True, text=True).stdout
print("\n".join(l for l in out.splitlines() if l.startswith(("TestNeu", "Ambient ", "Club "))))
print(subprocess.run([sys.executable, "Tools/shadercheck.py"], capture_output=True, text=True).stdout.strip().splitlines()[-1])
shake = subprocess.run([sys.executable, "Tools/shake_scan.py"], capture_output=True, text=True).stdout.splitlines()
hit = False
for k, l in enumerate(shake):
    if any(l.strip() == "== Scene2D\\%s.frag" % r[0] for r in rows):
        hit = True
        print(l); print("\n".join(shake[k + 1:k + 4]))
print("shake: " + ("FUNDE oben" if hit else "keine Funde"))
