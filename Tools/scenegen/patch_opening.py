# -*- coding: utf-8 -*-
"""Narrow "one centre per chain" to what the user meant: rosettes and
kaleidoscopes are fine, the problem is the dark OPENINGS the picture keeps
streaming into (tunnel, Droste zoom, log-polar spiral, pole streams).
Renames the rule to "opening" in chain_classes.py, gen.py and the app."""
import io, os, re
SG = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(SG, "..", "..")

def rw(p, fn):
    s = io.open(p, encoding="utf-8", newline="").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    s = fn(s)
    if crlf:
        s = s.replace("\n", "\r\n")
    io.open(p, "w", encoding="utf-8", newline="").write(s)

NEW_CC = '''# Classes that stream the picture into (or out of) a point without end: the
# tunnel, the Droste zooms, the log-polar spirals and the pole streams.  Their
# centre is a dark opening the eye keeps flying into, and with two of them in
# one chain nearly every roll read as a tunnel.  (Rosettes and kaleidoscopes
# have a centre too, but a still one -- they are not in this list.)  The app
# lets at most one stage of a flat lab (2D lab, FxChain) hold such a class --
# at the roll and on every walk step -- from the "// @chainopening" lines gen.py
# writes (positions in the lists above).
OPENING = {
    "chainAP": {"Droste zoom", "Escher spiral Droste", "bipolar Droste", "hyperbolic Droste", "log-polar spiral",
                "hyperbolic spiral", "parabolic stream", "hyperbolic Moebius flow", "bipolar stream",
                "loxodromic stream", "tunnel"},
    "chainBP": set(),
    "chainCP": {"spiral", "tunnel"},
    "chainDP": set(),
}
def opening_positions(knob, names):
    return [i for i, n in enumerate(names) if n in OPENING.get(knob, set())]
'''

def cc(s):
    i = s.index("# Classes that give the picture ONE centre")
    return s[:i] + NEW_CC
rw(os.path.join(SG, "chain_classes.py"), cc)

def gen(s):
    a = '''        if not _ex:                                             # the flat labs: at most one centred stage
            for _k in ("chainAP", "chainBP", "chainCP", "chainDP"):
                out.append("// @chaincentred %s %s" % (_k, "|".join(str(i) for i in _ccm.centred_positions(_k, _CC[_k]))))
'''
    assert s.count(a) == 1
    return s.replace(a, '''        if not _ex:                                             # the flat labs: at most one stage with an opening
            for _k in ("chainAP", "chainBP", "chainCP", "chainDP"):
                out.append("// @chainopening %s %s" % (_k, "|".join(str(i) for i in _ccm.opening_positions(_k, _CC[_k]))))
''')
rw(os.path.join(SG, "gen.py"), gen)

def cpp(s):
    s = s.replace("m_chainCentred", "m_chainOpening").replace("centredAt", "opensAt").replace("flatClass", "closedClass")
    s = s.replace('"// @chaincentred "', '"// @chainopening "')
    s = s.replace('// "// @chaincentred chainAP 1|4|9": the classes with a centre (flat labs only)',
                  '// "// @chainopening chainAP 9|10|13": the classes streaming into an opening (flat labs only)')
    s = s.replace("""	// At most one of the stages A..D on a class with a centre (a vanishing
	// point, a rosette, a zoom into a point): with two or more nearly every roll
	// of the flat labs read as a tunnel.  The first such stage keeps its class,
	// every later one moves to the nearest class without a centre.  The knobs
	// are constant for the whole activation, so this never shows as a jump.""",
"""	// At most one of the stages A..D on a class that streams the picture into
	// an opening (tunnel, Droste zoom, log-polar spiral, pole stream): with two
	// or more nearly every roll of the flat labs read as a tunnel.  The first
	// such stage keeps its class, every later one moves to the nearest class
	// without an opening.  The knobs are constant for the whole activation, so
	// this never shows as a jump.""")
    s = s.replace("(one centre per chain)", "(one opening per chain)")
    s = s.replace("""	// One centre per chain on the walk too: a stage may only fade to a class
	// with a centre while no other stage shows one or is fading to one.""",
"""	// One opening per chain on the walk too: a stage may only fade to a class
	// with an opening while no other stage shows one or is fading to one.""")
    s = s.replace("const float sub = x * cnt - (float) k;          // the sub-variant (arms, mirrors ...) stays",
                  "const float sub = x * cnt - (float) k;          // the sub-variant (arms, mirrors ...) stays")
    return s
rw(os.path.join(ROOT, "Source", "EffectShader.cpp"), cpp)

def h(s):
    s = s.replace("m_chainCentred", "m_chainOpening").replace("centredAt", "opensAt").replace("flatClass", "closedClass")
    s = s.replace('///< Stage knob -> positions of its classes with a centre, from "// @chaincentred".',
                  '///< Stage knob -> positions of its classes streaming into an opening, from "// @chainopening".')
    s = s.replace('/// @brief Reads the chain lab\'s "// @chainclasses" / "// @chaincentred" lines',
                  '/// @brief Reads the chain lab\'s "// @chainclasses" / "// @chainopening" lines')
    s = s.replace("/// @brief Whether knob value x of stage s (0..3 = A..D) picks a class with a centre (see chain_classes.CENTRED).",
                  "/// @brief Whether knob value x of stage s (0..3 = A..D) picks a class streaming into an opening (chain_classes.OPENING).")
    s = s.replace("/// @brief The nearest class of stage s without a centre (energy order), same sub-variant; x if there is none.",
                  "/// @brief The nearest class of stage s without an opening (energy order), same sub-variant; x if there is none.")
    return s
rw(os.path.join(ROOT, "Source", "EffectShader.h"), h)
print("ok")
