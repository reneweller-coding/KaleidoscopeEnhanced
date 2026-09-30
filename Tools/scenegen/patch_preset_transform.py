# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the public preset 'Transformationen' -- nothing but
the transform chains (labs, named chains, 3D chains, frozen likes), FxChain as
the only FX besides FxPlain."""
import io, os
f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "make_genre_configs.py")
s = io.open(f, encoding="utf-8", newline="").read()
old = 'CHAIN_LABS = ("ChainLab2D", "ChainLab3D", "ChainLabTunnel")\n'
assert s.count(old) == 1
s = s.replace(old, old + '''# Every transform-chain scene: the labs, the named chains (Chain*, Chain3D*)
# and frozen liked rolls (ChainLike*) -- not the old chain-mail scene.
def rule_transform(m, h):
    fm = re.search(r'file="[^"]*[\\\\/](\\w+)\\.frag"', h)
    n = fm.group(1) if fm else ""
    return n.startswith("Chain") and not n.startswith("Chainmail")
def rule_fxchain(m, h):     return "FxChain.frag" in h
''')
old = '    "Kettenlabor": (600, 1800, 15, 30),\n'
assert s.count(old) == 1
s = s.replace(old, old + '    # All transform scenes: a named chain gets a normal stretch, a lab (which\n'
                         '    # walks) may stay long -- 90..300 s solo, gentle 6..12 s fades.\n'
                         '    "Transformationen": (90, 300, 6, 12),\n')
old = 'KNOB_RANGES = {"Kettenlabor": {"morphP": ("0.5", "1")}}'
assert s.count(old) == 1
s = s.replace(old, 'KNOB_RANGES = {"Kettenlabor": {"morphP": ("0.5", "1")},\n'
                   '               "Transformationen": {"morphP": ("0.5", "1")}}')
old = '    ("Kettenlabor", rule_chainlab,    False, rule_none),\n'
assert s.count(old) == 1
s = s.replace(old, old + '    ("Transformationen", rule_transform, False, rule_fxchain),\n')
io.open(f, "w", encoding="utf-8", newline="").write(s)
print("ok")
