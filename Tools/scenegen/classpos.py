# -*- coding: utf-8 -*-
"""Knob value that picks a class by name: classpos.py knob "class name" [sub]
(sub = sub-variant 0..1 inside the class)."""
import sys
from chain_classes import CLASSES
knob, name = sys.argv[1], sys.argv[2]
sub = float(sys.argv[3]) if len(sys.argv) > 3 else 0.35
lst = CLASSES[knob]
i = lst.index(None if name == "none" else name)
print("%.4f" % ((i + sub) / len(lst)))
