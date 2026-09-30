# -*- coding: utf-8 -*-
"""Usage: register_new.py Name:mood,mood:complexity ...
Register the first block of the high-Schauwert scenes in Komplett.xml,
right before the closing </configuration>. Params are the *P uniforms each
shader declares (0..1 per activation) plus the hueP expression convention."""
import io, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BS = chr(92)
import sys as _s
REPLACE = "--replace" in _s.argv
SCENES = [(a.split(":")[0], a.split(":")[1], int(a.split(":")[2])) for a in _s.argv[1:] if not a.startswith("--")]
p = os.path.join(ROOT, "Presets", "Komplett.xml")
s = io.open(p, encoding="utf-8", newline="").read()
eol = "\r\n" if "\r\n" in s else "\n"
blocks = []
for name, mood, cx in SCENES:
    frag = os.path.join(ROOT, "Scene2D", name + ".frag")
    assert os.path.exists(frag), frag
    if (name + ".frag\"") in s:
        if not REPLACE:
            print("schon registriert:", name); continue
        # Neubau: den alten Eintrag komplett entfernen, neu anhaengen.
        k = s.index(name + ".frag\"")
        st = s.rindex("<TextureShader", 0, k)
        st = s.rindex(eol, 0, st) + len(eol)
        en = s.index("</TextureShader>", k) + len("</TextureShader>")
        en = s.index(eol, en) + len(eol)
        s = s[:st] + s[en:]
        print("alter Eintrag entfernt:", name)
    src = io.open(frag, encoding="utf-8").read()
    params = [m for m in re.findall(r"uniform float (\w+P);", src) if m != "hueP"]
    lines = ['  <TextureShader file="..' + BS * 2 + 'Scene2D' + BS * 2 + name + '.frag" type="normal" mood="%s" probability="0.45" complexity="%d">' % (mood, cx),
             '    <rig preset="flat"/>']
    for q in params:
        lines.append('    <float name="%s" minValue="0" maxValue="1"></float>' % q)
    for en_, fo_ in re.findall(r"^// @expr (\w+) = (.+)$", src, re.M):
        lines.append('    <expr name="%s" formula="%s"/>' % (en_, fo_.strip()))
    lines.append('    <expr name="hueP" formula="chromaHue + seed1*6.28"/>')
    lines.append('    <float name="hueP" minValue="0.0" maxValue="6.28"></float>')
    lines.append('  </TextureShader>')
    blocks.append(eol.join(lines) + eol)
    print("registriert:", name, params)
anchor = "</configuration>"
i = s.rindex(anchor)
s = s[:i] + eol.join(blocks) + eol + s[i:]
io.open(p, "w", encoding="utf-8", newline="").write(s)
