# Transformationsketten ins Framework integrieren (30.09.2026)

Ausgangspunkt: jede stetige Texturtransformation (Kaleidoskop, Tunnel,
Spirale, Möbius …) lässt sich mit jeder anderen verketten; 3D-Raumfaltungen
genauso. Die Zahl der Kombinationen ist praktisch unbegrenzt. Die Frage ist
nicht mehr *wie man eine Szene baut*, sondern *wie man eine unbegrenzte
Menge davon sinnvoll ausspielt, auswählt und behält*.

## 1. Was jetzt steht

| Baustein | Inhalt |
|---|---|
| **2D-Baukasten** (`Tools/scenegen/gen.py`, `CHAIN_LIB`) | 23 Transformationen: Kaleidoskop, log-polare Spirale, Tunnel (wanderndes Zentrum), Polar, Möbius, Quadrat, Inversion, Exp, Sin, Joukowski, bipolar, hyperbolische Poincaré-{p,q}-Kachelung, Droste, p6m, p4m, iterierte Faltung, Spiegelachse, Twirl, Warp, Welle, Ripple, Linse, Drehung. Nahtlos-Regel: `mirrorUV` zwischen den Stufen. `imgChain` liefert Foto + Gradient mit nahtsicherem Mip-Footprint. |
| **Kanäle statt RGB** | Foto, Relief, Leuchtkanten, Isolinien (`styleP`); Farbfeld aus den Kettenkoordinaten, das mit `audioPhase` wandert (`paletteP`). |
| **3D-Baukasten** (`CHAIN3D_LIB`) | Oktaeder-/Tetraeder-Spiegel, Box-/Kugelfaltung, Skalierung mit `gDR`, gespiegelte Wiederholung, polare Wiederholung, Verdrillung, Inversion, Rauschverzerrung; Endkörper Box, Kugel, Torus, Gyroid; triplanare Einfärbung mit einer 2D-Kette. |
| **Kollisionsfreie Kamera** | Die Kamera fliegt auf einer stetigen, geschwungenen Bahn `camPathXY(z)`; ein weicher Tunnel um diese Bahn wird aus jedem Körper gefräst (`fieldD`). Zustandslos, weil die Bahn nur von `z` abhängt; garantiert frei, egal welche Faltung gewürfelt wurde. |
| **Kuratierte Ketten** | 24 `Chain*` (2D) und 5 `Chain3D*`: einzeln bewertet, mit Katalogbild. |
| **Kettenlabore** | `ChainLab2D`, `ChainLab3D` (siehe 2). |
| **Gemerkte Würfe** | Taste `f` / Herz der Fernbedienung schreibt die Würfel nach `liked_rolls.tsv`; `promote_likes.py` friert sie zu eigenen Szenen ein (siehe 3). |

## 2. Kettenlabor: eine Datei, zehntausende Ketten

Das Framework würfelt die Float-Knöpfe einer Szene **bei jeder Aktivierung**
neu (`Uniform::resetParameters`) und hält sie danach konstant — das
Songstruktur-Gedächtnis stellt Werte ebenfalls nur *vor* dem Einblenden
wieder her. Deshalb darf ein Knopf hier eine **diskrete Wahl** treffen
(`floor(x·N)`), ohne die Stetigkeits-Regel zu verletzen: der Wechsel
passiert unsichtbar zwischen zwei Auftritten.

* **ChainLab2D**: vier Stufen aus Klassen — globale Abbildung (11), Symmetrie
  (6), zweite Abbildung (8), Verzerrung (6) — plus Untervarianten aus dem
  Nachkomma-Anteil desselben Knopfs (Zähligkeit, Armzahl, {p,q}, Gittergröße),
  4 Stile, Palette: gut 3000 Ketten × Untervarianten × Stil.
* **ChainLab3D**: Raum (5) × Faltkern (5) × Körper (5), alle 125 Kombinationen
  gerendert und nachgebessert, eingefärbt mit der 2D-Stufenmaschine.
* **Grammatik statt Zufall**: Die Klassen sorgen dafür, dass jede Kette
  „Abbildung → Symmetrie → Abbildung → Verzerrung“ hat — zwei Verzerrungen
  hintereinander oder eine Kette ohne Struktur kommen nicht vor.
* **Ketten-Morph** (`morphP`): würfelt, welche Stufe (oder keine) während der
  Szene weiterwandert. Getrieben von `sceneAdvance` (steigt bei Spektralfluss
  und Harmoniewechseln): Transformation halten, dann über die gespiegelten
  Ausgaben zweier Nachbarn überblenden — beide stetig, also sprungfrei. Die
  Musik greift damit direkt in die *Wahl der Geometrie*.
* **Kosten**: Die Stufenwahl hängt nur an Uniforms, alle Pixel nehmen
  denselben Zweig; die Kette wird je Pixel 6-mal ausgewertet. ChainLab2D
  sollte bei 120 fps bleiben wie die kuratierten Ketten; **ChainLab3D ist noch
  nicht gemessen** (fps_probe spielt Musik — erst wenn du wach bist).

## 3. Vom Wurf zur Szene: merken, einfrieren, bewerten

Ein Labor zeigt jedes Mal etwas Neues; was gefällt, soll bleiben.

1. **Merken**: `f` (oder Herz in der Fernbedienung) schreibt wie bisher den
   Geschmacksbonus und jetzt zusätzlich eine Zeile nach `liked_rolls.tsv`
   (neben der ini, in `.gitignore`): Zeit, Szene, alle gewürfelten Werte.
   Das funktioniert für *jede* Szene, nicht nur für Labore.
2. **Einfrieren**: `python Tools/scenegen/promote_likes.py` macht aus jedem
   gelikten Labor-Wurf `ChainLike2D…`/`ChainLike3D…`: die Laborquelle mit den
   Strukturknöpfen als Konstanten, gebaut und registriert (Moods/Bewertung
   vom Labor). Getestet bildgleich mit dem Labor. Vorteile gegenüber einem
   Mehrfacheintrag mit festgenagelten Werten: unabhängig von späteren
   Klassenerweiterungen (sonst zeigte derselbe Wert auf eine andere Kette),
   eigener Name, eigene Bewertung und eigenes Katalogbild, und der Compiler
   faltet die Stufenwahl weg.
3. **Bewerten**: wie jede neue Szene über `preset_fit.tsv`.

So wächst der Katalog aus dem, was du beim Zuschauen magst, statt aus dem,
was ich mir ausdenke.

## 4. Einbindung in Presets und Planer

* Labore und kuratierte Ketten stehen normal in `Komplett.xml` und laufen
  über `make_genre_configs.py` in die Genre-Presets (Stimmung
  psychedelic/dreamy/energetic).
* **Gewichtung**: Ein Labor ist *eine* Szene mit unbegrenzter Vielfalt. Mit
  normaler Wahrscheinlichkeit (0,45) kommt es so oft wie jede andere Szene —
  das halte ich für richtig, bis wir Erfahrung haben. Wenn es zu selten
  wirkt: mehrere Einträge derselben Datei mit **eingeschränkten Bereichen**
  (das Framework kann das, „entries reuse one“), z. B. ein Noir-Eintrag nur
  mit Relief/Isolinien, ein Galerie-Eintrag nur mit Foto-Stil, ein
  Club-Eintrag nur mit Tunnel/Spirale in Stufe A.
* **Katalog**: je Labor ein Katalogbild; die eingefrorenen Likes bekommen
  ihre eigenen.

## 5. Kamera für 3D-Ketten

Umgesetzt: gefräster Tunnel um eine zustandslose Bahn (siehe 1). Nächste
Schritte, alle stetig und ohne Audio auf der Kamera:

* **Tunnelradius atmet** mit einem langsamen Signal (Swell) — die Welt rückt
  näher/ferner, ohne dass die Kamera ruckt.
* **Querneigung aus der Bahnkrümmung** (reine Zeitfunktion): der Flug legt
  sich in die Kurven.
* **Ausweichen statt Fräsen** für offene Welten: den Kamerapunkt an jeder
  Stelle `z` per Gradientenschritt vom Feld wegschieben — bleibt eine reine
  Funktion von `z`, also zustandslos und stetig; der Tunnel bleibt als
  Sicherheitsnetz.

## 6. Weiterdenken

* **Kette als Gelände**: die Luma einer 2D-Kette als Höhenfeld, darüber
  fliegen — jede Kette wird auch eine Landschaft.
* **Kette als Strömung**: Partikel/LIC entlang des Kettengradienten.
* **Zwei Ketten mischen**: Kette A als Maske für Kette B, die Maske selbst
  eine Kette.
* **Mehr Transformationen**: weitere Spiegel-Tapetengruppen (p3m1, pmm —
  nur Spiegelgruppen sind als Faltung stetig), Kleinsche/Apollonische
  Faltungen, elliptische Funktionen; 3D: Menger-Faltung, Pseudo-Kleinian,
  Amazing Surface.
* **Musik in der Struktur, weiter gefasst**: langsame integrierte Signale an
  Faltwinkel, Spiralsteigung, Polabstand, {p,q}; Harmoniewechsel als Anstoß
  für den Ketten-Morph (läuft bereits über `sceneAdvance`).
* **Labor-Audit automatisch**: N Würfe rendern, Leere/Helligkeit/Detail
  messen (`scene_metrics`), schwache Stufenkombinationen im Shader umlenken —
  so wie das 125er-Raster für 3D, nur ohne dass jemand hinschauen muss.
