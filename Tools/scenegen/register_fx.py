# -*- coding: utf-8 -*-
"""Register a generated overlay (FX/<Name>.frag) in Presets/Komplett.xml as a
CombineShader right after FxKaleidoscope.  The knob ranges are given here, since
an overlay usually wants narrower ranges than the scene it came from.
Usage: register_fx.py Name mood probability complexity "knob:min:max" ..."""
import io, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BS = "\\"
name, mood, prob, cx = sys.argv[1:5]
knobs = [k.split(":") for k in sys.argv[5:]]
f = os.path.join(ROOT, "Presets", "Komplett.xml")
s = io.open(f, encoding="utf-8", newline="").read()
eol = "\r\n" if "\r\n" in s else "\n"
if (name + ".frag\"") in s:
    sys.exit("already registered: " + name)
anchor = '<CombineShader file="..' + BS * 2 + 'FX' + BS * 2 + 'FxKaleidoscope.frag"'
i = s.index(anchor)
j = s.index("</CombineShader>", i) + len("</CombineShader>") + len(eol)
blk = ['  <CombineShader file="..' + BS * 2 + 'FX' + BS * 2 + name + '.frag" type="normal" mood="%s" probability="%s" complexity="%s">' % (mood, prob, cx)]
blk += ['    <float name="%s" minValue="%s" maxValue="%s"></float>' % tuple(k) for k in knobs]
blk += ['    <expr name="hueP" formula="chromaHue + seed1*6.28"/>',
        '    <float name="hueP" minValue="0.0" maxValue="6.28"></float>',
        '  </CombineShader>']
s = s[:j] + eol.join(blk) + eol + s[j:]
io.open(f, "w", encoding="utf-8", newline="").write(s)
print("registered FX:", name)
