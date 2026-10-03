# Nachtrunde 02./03.10.2026

Umsetzung der Ideenliste vom Abend. Punkt 4 der vorigen Liste („Welten über
Nacht vorschmieden“) ist zurückgestellt, zum gemeinsamen Überlegen.

| # | Punkt | Stand |
|---|---|---|
| 1 | Visuelle Regression des ganzen Katalogs | fertig: Werkzeug, Basislinie, Vergleich (1424 Szenen, 0 Fehlschläge) |
| 2 | VRAM des 3D-Labors | fertig (schon vorher, f54581d5) |
| 3 | Flimmer-/Aliasing-Maß je Klasse + gezieltes Supersampling | fertig (9 Klassen, +0,3 ms) |
| 4 | Automatische Qualität für schwache GPUs | fertig; iGPU-Messung steht aus (Windows-Einstellung) |
| 5 | Energie-Ordnung der 3D-Welt messen | fertig, angewendet |
| 6 | Geschmackslernen im Walk | fertig |
| 7 | Weiche Laborwechsel | fertig |
| 8 | Ein Release-Check-Befehl | fertig (alle Schritte grün, s. `docs/release_check.md`) |
| 9 | Iso-Linien im Raumschnitt | fertig (`isoP`) |
| – | GPU-Kosten je Klasse vervollständigen | fertig (119/119) |
| – | Zeitneigung je Musikabschnitt sichtbar prüfen | geprüft; dabei Fehler mit Partitur-Cues behoben |

## Was es jetzt gibt

**1 – Katalog-Regression.** `python Tools/scene_snapshots.py render <name> --jobs 3`
friert jede der 1424 Szenen aus `Komplett.xml` ein (Vergleichslauf: festes
Foto, `KALEIDO_SEED=7`, 600 Festschritte, dann steht alles) und speichert ein
640×360-Bild unter `%LOCALAPPDATA%\KaleidoscopeVisualizer\snapshots\<name>`.
`compare <alt> <neu>` schreibt einen HTML-Bericht. Basislinie:
`2026-10-03-base` (Stand vor den Shader-Änderungen der Nacht), Vergleichslauf
`2026-10-03-night`. Gegen v1.17.0 direkt geht es nicht: v1.17 kennt die
Vergleichsläufe noch nicht. Künftige Releases vergleichen gegen den Satz in
`Tools/snapshot_baseline.txt`.

**3 – Aliasing und Supersampling.** `chain_class_stats.py --alias`: je Klasse
der Unterschied zwischen Direktbild und 2×2-supersampeltem Bild (Aliasing)
und die zweite zeitliche Differenz (Flimmern – folgt aber vor allem der
Geschwindigkeit, deshalb nicht als Kriterium). Die 9 Klassen mit Aliasing
≥ 0,0075 (Theta-Welle, Archimedes-Spirale, Sonnenblume, Zeta-Teilsumme,
Chirikov, Kugel-Kaleidoskop, hyperbolisches Band, Apollonische Inversion,
Modulgruppen-Spiegel) laufen, solange sie zu sehen sind oder eine
Überblendung zu ihnen führt, auf doppeltem Raster; der Final-Pass mittelt
vier Fotoproben. Kosten: 0,63 → 0,93 ms GPU. Nur bei `chainScale` 1, nie auf
schwacher GPU; ini `chainSupersample`, `KALEIDO_CHAIN_SS=0`.

**4 – Qualitätsprofil.** ini `qualityProfile` auto|high|low. Intel, AMD
integriert, llvmpipe, Basic Render → für die Sitzung `chainScale` 0,5 und
adaptive Auflösung; nichts davon wird in die ini geschrieben. Geprüft: RTX
5090 → `high`; `low` erzwungen → Log `low`, ini danach unverändert.

**5 – Energie-Ordnung der 3D-Welt.** Gemessen bei T = 40 und 80 s
(Rangkorrelation 0,72–0,85), gemittelt, angewendet. Die Handordnung lag
daneben (Raum 0,37, Kern −0,17, Körper 0,21).

**6 – Geschmack je Klasse.** Like ×1,1, Skip ×0,96 (schnell ×0,92) auf die
gezeigten Klassen, Grenzen 0,6–1,6, 3 % Rückkehr je Start. Der Walk zieht drei
Ziele in der Region der Musik und wählt nach Gewicht. ini `[classTaste]`.

**7 – Laborwechsel.** Ein Kettenlabor, das während einer Überblendung
hereinkommt, übernimmt die Klassen des ausgehenden (nach Namen, samt
Untervariante); nicht nach Skip oder gezielter Wahl.

**8 – Release-Check.** `python Tools/release_check.py` → `docs/release_check.md`,
Rückgabewert = Zahl der roten Schritte.

**9 – Iso-Linien.** `isoP` im Raumschnitt: Höhenlinien des Abstandsfelds,
laufen langsam nach außen.

## Fehler, die dabei gefunden und behoben wurden

* **Erste Szene nicht reproduzierbar:** Sie lief nicht durch
  `resetParameters()` und behielt Würfe vom Laden, abhängig davon, welche
  Presets im Ordner lagen. Unter `KALEIDO_SEED` jetzt mitgeseedet.
* **Simulationen liefen im Freeze weiter** (auch beim VJ-Freeze): GPU- und
  Compute-Simulationen halten jetzt an. CrystalGrowth und LiquidMetal bleiben
  von Lauf zu Lauf leicht verschieden (GPU-Atomics).
* **Partitur-Cues erreichten den Walk nicht:** Mit Phosphene-Cues folgte das
  Wandern der eigenen Analyse, und die Zeitneigung drehte sich nie. Jetzt zählt
  der Walk die Cue-Abschnitte; der Wechsel Cue ↔ Analyse ist kein Abschnitt.
* **Hängendes MIDI blockierte den Start:** Gegen 01:00 kehrte
  `midiInGetNumDevs()` systemweit nicht mehr zurück – jede neue App-Instanz
  blieb stehen. MIDI öffnet jetzt in einem eigenen Thread.
* `s_lastChain` war undokumentiert (Doxygen-Schritt des Release-Checks).
* `chain_regress.py` endete trotz 0 Abweichungen mit Code 1 (`sys.exit` mit
  einer NumPy-Zahl) – der erste Release-Check war deshalb fälschlich rot.

## Offen / für später

* iGPU-Messung: dazu in den Windows-Grafikeinstellungen die integrierte GPU
  für Kaleidoscope wählen (Systemeinstellung – nicht von mir geändert).
* Das Windows-MIDI-Subsystem hing um 01:00; ein Neustart des Rechners (oder
  des MIDI-Dienstes) sollte es lösen.
* „Welten über Nacht vorschmieden“ – gemeinsam überlegen.

## Zahlen

* **Katalog Basislinie → Nachtstand:** 1424 verglichen, 17 geändert, 0 neu
  schwarz, 15 „unruhig“ (Bild kommt nach dem Einfrieren nur langsam oder nie
  zur Ruhe). Geändert sind ChainLab3D und ChainSlice3D (gewollt: neue
  Weltordnung) sowie Simulationsszenen (LightningStorm, Schlieren,
  Murmuration, LiquidMetal, Fluid, Reaktion-Diffusion …). Deren
  Basislinienbilder entstanden teils noch ohne Simulations-Halt, und einige
  rechnen mit GPU-Atomics, sind also von Lauf zu Lauf leicht verschieden.
  38 Szenen sind still und eingefroren in beiden Sätzen fast schwarz; das sind
  musikgetriebene Szenen, keine Fehler. Bericht:
  `%LOCALAPPDATA%\KaleidoscopeVisualizer\snapshots\2026-10-03-night\report_vs_2026-10-03-base.html`.
* **Leistung (Release-Check):** alle Kettenlabore 120 fps; GPU-p90 2D 1,17 ms,
  Tunnel 1,40, 3D 3,70, Raumschnitt 2,40 ms (Release-Check 03:49, GRÜN).
* **Runner = Gesamt-Shader:** 0 von 10 Kombinationen weichen ab.
* **Supersampling:** Thetawelle 0,63 → 0,93 ms, Archimedes-Spirale 0,62 → 0,96 ms.
