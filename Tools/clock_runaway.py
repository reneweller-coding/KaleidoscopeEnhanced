# -*- coding: utf-8 -*-
"""Findet Szenen, die mit der Laufzeit aus ihrer eigenen Welt herausfliegen.

`time` laeuft seit dem Programmstart und wird nie zurueckgesetzt
(RenderPipeline.cpp, m_globaltime += dt).  `audioAdvance` und `audioPhase`
sind genauso Integratoren.  Wer eine dieser Groessen LINEAR in eine Position
steckt -- eine Kamera, ein Domaenen-Zentrum, einen Zoom -- schiebt sich
langsam von seiner Geometrie weg.  Nach ein paar Minuten trifft kein Strahl
mehr etwas und uebrig bleibt der Hintergrund.

Gemessen an HyperbolicTilingPolyhedralFlight, einmal je Startzeit der Uhr:

    Uhr        0 s   ->  Struktur 0.1939
    Uhr      120 s   ->           0.0075
    Uhr      900 s   ->           0.0014
    Uhr     3600 s   ->           0.0005

Die Szene ist nach zwei Minuten tot.  Im normalen Betrieb laeuft das Programm
stundenlang, im Screening dagegen wurde jede Szene nach wenigen Minuten
gemessen -- deshalb ist die Klasse so lange unentdeckt geblieben.

Zwei saubere Auswege:

  * `sceneTime` statt `time` -- Sekunden seit DIESER Aktivierung.  Der Flug
    faengt bei jedem Auftritt neu an.  Passt, solange eine Solo-Spanne
    (~45 s) Flug die Geometrie nicht schon verlaesst.
  * Die Domaene periodisch machen (`mod` auf die Flugachse) und den
    Kamera-Ursprung mitwrappen.  Dann ist der Flug wirklich endlos --
    und die Koordinaten bleiben klein genug fuer float.

Nur `sin`/`cos`/`mod`/`fract` & Co. um die Groesse herum machen sie harmlos:
eine Phase darf beliebig wachsen, eine Position nicht.

    python Tools/clock_runaway.py [--all]
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ("Scene2D", "Scene3D")

# Waechst unbegrenzt, solange das Programm laeuft.
SEEDS = {"time", "audioAdvance", "audioPhase"}

# Bringt jeden Wert in einen endlichen Bereich zurueck -- danach ist es egal,
# wie gross das Argument war.  `floor`, `sqrt` und `pow` stehen bewusst NICHT
# hier: die begrenzen nichts.
BOUND = {
    "sin", "cos", "tan", "sincos", "mod", "fract", "atan", "atan2",
    "clamp", "smoothstep", "step", "sign", "exp", "normalize",
    "texture", "textureLod", "cosh", "tanh", "saturate",
}

# Diese hier begrenzen nur ihr ERGEBNIS.  Ihr ARGUMENT ist genau die Stelle,
# an der eine grosse Zahl weh tut: `fbm(vec3(x, y, time))` tastet bei Uhr 3600
# ein Rauschfeld an Koordinate 3600 ab, und die float-Aufloesung dort loescht
# die Struktur, die das Bild ausmacht.  `hash11(time * 100.0)` ist derselbe
# Fall in scharf.  Sie standen zuerst in BOUND -- damit hat die Pruefung acht
# von neunzehn gemessenen Einbruechen uebersehen, darunter
# SupermassiveBlackHoleOrbit (0.172 -> 0.002).
DETAIL = {
    "hash", "hash11", "hash12", "hash13", "hash21", "hash31", "hash33",
    "noise", "snoise", "fbm", "valueNoise", "perlin", "voronoi", "curl",
    "turbulence", "worley",
}

# Namen, bei denen ein unbegrenzter Wert wirklich weh tut: Positionen.
POSITION = re.compile(
    r"^(ro|rd|eye|cam|camPos|camera|pos|p|q|pt|center|origin|"
    r"ta|target|lookAt|uv|st|coord|cellP|worldP)$")

IDENT = re.compile(r"[A-Za-z_][A-Za-z_0-9]*")
CALL = re.compile(r"([A-Za-z_][A-Za-z_0-9]*)\s*\(")
ASSIGN = re.compile(
    # Der Anker muss NULLBREIT sein: finditer verbraucht sonst das ";",
    # das der naechsten Anweisung als Anfang dient, und jede zweite
    # Zuweisung faellt aus der Analyse -- darunter genau die, die den
    # bekannten Fall ausgeloest hat.
    r"(?:(?<=[;{}])|^)\s*(?:(?:const\s+)?(?:float|vec2|vec3|vec4|int)\s+)?"
    r"([A-Za-z_][A-Za-z_0-9]*)\s*(?:\.[xyzwrgba]+)?\s*(?:\+)?=\s*([^;]*);")


def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def enclosing_calls(text, at):
    """Die Funktionsnamen, in deren Klammern `at` steht -- von innen nach aussen."""
    names, depth, i = [], 0, at - 1
    while i >= 0:
        c = text[i]
        if c == ")":
            depth += 1
        elif c == "(":
            if depth == 0:
                j = i - 1
                while j >= 0 and text[j].isspace():
                    j -= 1
                k = j
                while k >= 0 and (text[k].isalnum() or text[k] == "_"):
                    k -= 1
                nm = text[k + 1:j + 1]
                if nm:
                    names.append(nm)
            else:
                depth -= 1
        i -= 1
    return names


def unbounded_hits(expr, symbols, symbols_bound=BOUND):
    """Stellen, an denen ein Symbol aus `symbols` UNGESCHUETZT vorkommt."""
    out = []
    for m in IDENT.finditer(expr):
        if m.group(0) not in symbols:
            continue
        if any(n in symbols_bound for n in enclosing_calls(expr, m.start())):
            continue
        out.append(m.group(0))
    return out


FUNCDEF = re.compile(r"(?:float|vec2|vec3|vec4|int|bool|void)\s+([A-Za-z_][A-Za-z_0-9]*)\s*\(")


def scan_file(path):
    src = strip_comments(io.open(path, encoding="utf-8", errors="replace").read())
    # Eine selbstgeschriebene Funktion gibt einen NEUEN Wert zurueck --
    # ein Distanzschaetzer liefert eine Distanz, keine Position.  Ohne
    # das faerbt der Marschpunkt jede Variable dahinter unbegrenzt ein
    # und die Liste besteht aus Folgen statt Ursachen.  Preis: ein Helfer,
    # der wirklich eine Position zurueckgibt, entgeht der Pruefung.
    local = set(FUNCDEF.findall(src))
    unb = set(SEEDS)
    # Fixpunkt: was aus einem unbegrenzten Wert entsteht, ist selbst unbegrenzt.
    for _ in range(6):
        before = len(unb)
        for m in ASSIGN.finditer(src):
            name, expr = m.group(1), m.group(2)
            if name in unb:
                continue
            if unbounded_hits(expr, unb, BOUND | DETAIL | local):
                unb.add(name)
        if len(unb) == before:
            break

    grown = unb - SEEDS
    findings = []
    for m in ASSIGN.finditer(src):
        name, expr = m.group(1), m.group(2)
        if not POSITION.match(name):
            continue
        hits = unbounded_hits(expr, unb, BOUND | local)
        # Ist ro erst einmal unbegrenzt, sind ta, p und q es auch -- das sind
        # Folgen, keine Ursachen.  Gemeldet wird nur die Stelle, an der ein
        # unbegrenzter Wert ZUM ERSTEN MAL in eine Position geraet.
        hits = [h for h in hits if not POSITION.match(h)]
        if not hits:
            continue
        # Wrappt die Zeile sich selbst (mod/fract um den ganzen Ausdruck),
        # ist sie in Ordnung -- das ist genau der zweite saubere Ausweg.
        line = src[:m.start()].count("\n") + 1
        findings.append((line, name, " ".join(sorted(set(hits))),
                         " ".join(expr.split())[:70]))

    # Zweiter Mechanismus derselben Klasse: der Wert bleibt in seiner Welt,
    # landet aber als KOORDINATE in einem Rauschfeld.  Bei Uhr 3600 tastet
    # `fbm(vec3(x, y, time))` das Feld bei 3600 ab -- dort hat float keine
    # Aufloesung mehr fuer das Detail, und das Bild wird flach.  Diese Form
    # sieht im Quelltext voellig harmlos aus und war fuer acht der neunzehn
    # gemessenen Einbrueche verantwortlich.
    for m in CALL.finditer(src):
        if m.group(1) not in DETAIL:
            continue
        # `float hash11(float n)` ist die DEFINITION, kein Aufruf -- sonst
        # meldet jede Rauschfunktion sich selbst, und zwar in jeder Datei.
        before = src[max(0, m.start() - 24):m.start()].split()
        if before and before[-1] in ("float", "vec2", "vec3", "vec4", "int"):
            continue
        depth, i = 1, m.end()
        while i < len(src) and depth:
            depth += (src[i] == "(") - (src[i] == ")")
            i += 1
        arg = src[m.end():i - 1]
        hits = unbounded_hits(arg, unb, BOUND | local)
        if not hits:
            continue
        line = src[:m.start()].count("\n") + 1
        findings.append((line, m.group(1) + "()", " ".join(sorted(set(hits))),
                         " ".join(arg.split())[:70]))

    return sorted(findings), sorted(grown)


def main():
    show_all = "--all" in sys.argv
    total, files = 0, 0
    for d in DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for fn in sorted(os.listdir(base)):
            if not fn.endswith((".frag", ".vert")):
                continue
            path = os.path.join(base, fn)
            hits, grown = scan_file(path)
            if not hits:
                continue
            files += 1
            total += len(hits)
            print("%s/%s" % (d, fn))
            for line, name, syms, expr in (hits if show_all else hits[:3]):
                print("    Zeile %-5d %-8s <- %-24s %s" % (line, name, syms, expr))
            if not show_all and len(hits) > 3:
                print("    ... %d weitere" % (len(hits) - 3))
    print()
    print("%d Stellen in %d Dateien." % (total, files))
    print("Das ist eine VERDACHTSLISTE, kein Befund: eine periodische Domaene")
    print("(mod im map()) macht denselben Ausdruck voellig korrekt.  Wer hier")
    print("steht, gehoert mit --time-start gemessen:")
    print("    python Tools/screen.py --scenes <Name> --time-start 3600")
    return 0


if __name__ == "__main__":
    sys.exit(main())
