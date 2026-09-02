# -*- coding: utf-8 -*-
"""Enum und Namenstabelle muessen dieselbe Laenge haben -- sonst schweigt es.

Zwei Stellen in der Engine koppeln einen Enum an eine Tabelle von Strings, die
in DERSELBEN Reihenfolge stehen muss:

    EffectShader.cpp   enum AudioLoc { AL_PHASE, ... }  <->  kAudioLocNames[]
    ExprEval.h/.cpp    enum Index    { V_TIME, ... }    <->  kVarNames[]

Fehlt in einer Seite ein Eintrag, verschiebt sich alles dahinter um eins: die
Uniform `audioKick` bekaeme den Wert von `audioSnare`, die Formelvariable
`phase` den von `advance`.  Kein Compiler-Fehler, keine Warnung, nur ein
Katalog, der leise falsch reagiert.  Beide Tabellen sind heute zweimal von
Hand erweitert worden (sceneAdvance, progress).

    python Tools/check_enum_tables.py        # Exit 1 bei Abweichung
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(rel):
    return io.open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()


def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def enum_ids(src, head, prefix, count_name):
    """Bezeichner eines Enums in Deklarationsreihenfolge, ohne den Zaehler."""
    i = src.index(head)
    body = src[i + len(head):src.index("}", i)]
    ids = re.findall(r"\b(%s[A-Z0-9_]*)\b" % prefix, strip_comments(body))
    return [x for x in ids if x != count_name]


def table_strings(src, head):
    i = src.index(head)
    body = src[i + len(head):src.index("};", i)]
    return re.findall(r'"([^"]*)"', strip_comments(body))


def check(label, ids, names):
    ok = len(ids) == len(names)
    print("%-28s %3d Enum-Eintraege, %3d Namen  %s"
          % (label, len(ids), len(names), "OK" if ok else "ABWEICHUNG"))
    if not ok:
        for k in range(max(len(ids), len(names))):
            a = ids[k] if k < len(ids) else "-"
            b = names[k] if k < len(names) else "-"
            print("    %3d  %-22s %s" % (k, a, b))
    return ok


def main():
    es = read("Source/EffectShader.cpp")
    al = enum_ids(es, "enum AudioLoc {", "AL_", "AL_COUNT")
    an = table_strings(es, "kAudioLocNames[AL_COUNT] = {")

    eh = read("Source/ExprEval.h")
    ec = read("Source/ExprEval.cpp")
    vi = enum_ids(eh, "enum Index {", "V_", "V_COUNT")
    vn = table_strings(ec, "kVarNames[ExprVars::V_COUNT] = {")

    ok = check("AudioLoc / kAudioLocNames", al, an)
    ok = check("ExprVars / kVarNames", vi, vn) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
