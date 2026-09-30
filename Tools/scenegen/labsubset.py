# -*- coding: utf-8 -*-
"""Give a lab that evaluates the chain many times per pixel its own class
subset: the excluded classes' branches are removed from the stage switches
(their code alone costs registers, even when not executed), the energy order
is renumbered and every class count in the stage wrappers adjusted.  The
matching names for the overlay (key v) come from chain_classes.subset_names."""
import re
import chain_classes as cc

STAGE_INFO = [("chainAP", "orda", "stageAk", "walkA", "1.3"), ("chainBP", "ordb", "stageBk", "walkB", "2.9"),
              ("chainCP", "ordc", "stageCk", "walkC", "4.7"), ("chainDP", "ordd", "stageDk", "walkD", "6.1")]

def _parse_ord(src, name):
    i = src.index("int %s(int i)" % name); j = src.index("\n", i)
    return [int(x) for x in re.findall(r"return (\d+);", src[i:j])], i, j

def _drop_branches(src, fn, ids):
    i = src.index("vec2 %s(vec2 uv, int k, float v)" % fn); j = src.index("\n}\n", i)
    lines = src[i:j].split("\n"); out = []; k = 0
    while k < len(lines):
        l = lines[k]; m = re.match(r"\s*if \(k == (\d+)\)", l)
        if m and int(m.group(1)) in ids:
            depth = l.count("{") - l.count("}"); k += 1
            while depth > 0 and k < len(lines):
                depth += lines[k].count("{") - lines[k].count("}"); k += 1
            continue
        out.append(l); k += 1
    return src[:i] + "\n".join(out) + src[j:]

def apply(stages, exclude, label):
    for knob, fn, stage, walk, salt in STAGE_INFO:
        o, i, j = _parse_ord(stages, fn)
        names = cc.CLASSES[knob]
        assert len(o) == len(names), knob
        drop = {o[p] for p, n in enumerate(names) if n in exclude.get(knob, set())}
        if not drop:
            continue
        keep = [x for x in o if x not in drop]
        stages = stages[:i] + "int %s(int i) { %s return %d; }   // %s subset, %d classes" % (
            fn, " ".join("if (i == %d) return %d;" % (p, x) for p, x in enumerate(keep[:-1])), keep[-1], label, len(keep)) + stages[j:]
        stages = _drop_branches(stages, stage, drop)
        n0, n1 = len(o), len(keep)
        for pat in ["%s, %d)" % (knob, n0), "%s.x, %d)" % (walk, n0), "%s.y, %d)" % (walk, n0)]:
            assert pat in stages, pat
            stages = stages.replace(pat, pat.replace(", %d)" % n0, ", %d)" % n1))
        stages, nw = re.subn(r"walkPick\(c( \+ 1\.0)?, k0, v0, %d, %s" % (n0, re.escape(salt)),
                             lambda m: m.group(0).replace(", %d, " % n0, ", %d, " % n1), stages)
        assert nw == 2, (knob, nw)
    return stages
