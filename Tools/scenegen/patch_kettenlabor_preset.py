# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the Kettenlabor preset in make_genre_configs.py --
only the three chain labs, always walking, long solo times."""
import io, os
f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "make_genre_configs.py")
s = io.open(f, encoding="utf-8", newline="").read()

old = 'TIMING = {\n    "SpaceAmbient": (55, 150, 22, 45),\n'
assert s.count(old) == 1
s = s.replace(old, old + '    # One chain lab walking with the music carries a long stretch on its own.\n'
                         '    "Kettenlabor": (600, 1800, 15, 30),\n')

old = 'GENRES = [\n'
assert s.count(old) == 1
s = s.replace(old, '''CHAIN_LABS = ("ChainLab2D", "ChainLab3D", "ChainLabTunnel")
def rule_chainlab(m, h):    return any(("%s.frag" % n) in h for n in CHAIN_LABS)
def rule_none(m, h):        return False
# Knob ranges a preset narrows for its scenes: in Kettenlabor every start walks.
KNOB_RANGES = {"Kettenlabor": {"morphP": ("0.5", "1")}}

''' + old)

old = '    ("Allround",    rule_all,         False),\n'
assert s.count(old) == 1
s = s.replace(old, old + '    ("Kettenlabor", rule_chainlab,    False, rule_none),\n')

old = '''        out.append(blk)
    if graded:'''
assert s.count(old) == 1
s = s.replace(old, '''        for knob, (lo, hi) in KNOB_RANGES.get(name, {}).items():
            blk = re.sub(r'(<float name="%s") minValue="[^"]*" maxValue="[^"]*"' % knob,
                         r'\\1 minValue="%s" maxValue="%s"' % (lo, hi), blk)
        out.append(blk)
    if graded:''')
io.open(f, "w", encoding="utf-8", newline="").write(s)
print("ok")
