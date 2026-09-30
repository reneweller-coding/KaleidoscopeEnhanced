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
  5 Stile (Foto, Relief, Leuchtkanten, fließende Isolinien, gekämmte Strömung), Palette: gut 3000 Ketten × Untervarianten × Stil.
* **ChainLab3D**: Raum (5) × Faltkern (6, seit dem Menger-Schwamm) × Körper (5);
  die ersten 125 Kombinationen alle gerendert und nachgebessert, Menger mit
  allen Körpern geprüft; eingefärbt mit der 2D-Stufenmaschine.
* **Grammatik statt Zufall**: Die Klassen sorgen dafür, dass jede Kette
  „Abbildung → Symmetrie → Abbildung → Verzerrung“ hat — zwei Verzerrungen
  hintereinander oder eine Kette ohne Struktur kommen nicht vor.
* **ChainLabTunnel**: dieselbe gewürfelte 2D-Kette als Wand eines Tunnels
  (wie die Original-Tunnelszenen), ihre Helligkeit als echtes Relief, die
  Rohrachse windet sich (wandernder Fluchtpunkt). Das Relief wird dort
  geglättet, wo die Kette das Foto staucht — sonst entstehen Sub-Pixel-Spitzen.
* **Kettenwanderung, von der Musik gesteuert** (`morphP` ≥ 0,5): Ein Labor
  ist kein einzelner Look, sondern ein Dauerläufer — eine einzige Laborszene
  trägt stundenlang, stetig, ohne Schnitt und ohne Wiederholung. Alle vier
  Stufen und der Stil wandern; die App (`EffectShader::stepChainWalk`) merkt
  sich je Stufe Anzeige, Ziel und Überblendfortschritt und entscheidet mit der
  Musik: neuer Songteil → neue globale Abbildung (oft auch neuer Stil),
  **wiederkehrender Songteil → zurück zur Kette von damals**, Drop → Verzerrung
  und Stil drehen schnell, Akkordwechsel → Symmetrie oder zweite Abbildung,
  sonst die am längsten gehaltene Stufe nach einer Haltezeit (35–90 s, kürzer
  bei mehr Energie). Die Klassen jeder Stufe sind nach Energie sortiert
  (ruhig … energiegeladen), die geglättete Energie wählt die Gegend, ein
  Zufallsanteil die Abwechslung. Der Planer schneidet ein wanderndes Labor
  nicht mehr bei Songteilwechseln und Drops weg (die Taste `n` wirkt weiter).
  Ohne App (Editor) wandert der Shader per Hash.
* **Auch die 3D-Welt wandert** (ChainLab3D): Raum, Faltkern und Körper sind
  weitere Wanderstufen; während eine davon überblendet, werden die
  Distanzfelder beider Welten gemischt — die Architektur schmilzt in die
  nächste (immer nur eine Strukturstufe zugleich; 89–95 fps währenddessen).
  Neu: Helix- und Sechseck-Räume, Kleinsche Faltung, Schwarz-P/D-Körper,
  Volumentextur (`solidP`: Zeit als dritte Achse), Relief (`reliefP`).
  2D neu: Riemann-Kugel, loxodromische Strömung, Blüte. **Falle:** der
  NVIDIA-Compiler lieferte bei mehreren dynamisch indizierten `const int[]`
  in einer Funktion immer Eintrag 0 — die Energie-Tabellen sind deshalb
  If-Ketten.
* **Ketten-Morph** (`morphP` 0,15–0,5): würfelt, welche Stufe (oder keine) während der
  Szene weiterwandert. Getrieben von `sceneAdvance` (steigt bei Spektralfluss
  und Harmoniewechseln): Transformation halten, dann über die gespiegelten
  Ausgaben zweier Nachbarn überblenden — beide stetig, also sprungfrei. Die
  Musik greift damit direkt in die *Wahl der Geometrie*.
* **Kosten**: Die Stufenwahl hängt nur an Uniforms, alle Pixel nehmen
  denselben Zweig. Gemessen in der App (fps_probe, lautlos): ChainLab2D,
  ChainLab3D und ChainLabTunnel je dreimal gewürfelt, dazu Chain3DMandelbox
  und Chain3DKifsTetra — überall 120 fps bei renderScale 1,00.

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

Nebenbei gefunden: Windows hatte auf diesem Rechner die TCP-Ports 7498–8665
reserviert (Hyper-V/WinNAT); die Fernbedienung (8091 ff.) konnte deshalb gar
nicht starten. Sie weicht jetzt auf 18091 ff. bzw. einen freien Port aus; die
LAN-Erkennung der Android-App meldet den echten Port. Im Browser also
`http://<pc>:18091/`, solange die Reservierung besteht.

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

## 6. Aus der Literatur (30.09.)

Eingebaut, jeweils nahtlos und in die Energie-Reihenfolge einsortiert:

* **Escher-Droste nach Lenstra/de Smit** (`tDrosteSpiral`): im Log-Raum mit
  β = 1 − i·log K/π multipliziert, der Log-Radius gespiegelt gefaltet — das
  Bild enthält sich gedreht und verkleinert, spiralförmig, endlos.
  (Erst mit log K/2π: eine halbe Spiegelperiode je Umdrehung → harte Naht.)
* **Farris-Tapetenfunktionen** („Creating Symmetry“, 2015; `tFarris`): Summen
  ebener Wellen, über die Symmetriegruppe gemittelt (p4, p3, p6, p4m); der
  komplexe Wert wählt das Pixel im Foto — genau das Prinzip der Labore.
  Phasen und Amplituden laufen mit der Zeit: die Tapete verwandelt sich,
  die Symmetrie bleibt.
* **Hyperbolisches Band** (`tHyperBand`, z = tanh(πw/4)): die {p,q}-Kachelung
  als endloser Streifen; eine Verschiebung entlang des Bandes ist eine exakte
  hyperbolische Translation.
* **Knightys polyedrische Faltung** (`fPoly`, Typ 3/4/5 = Tetraeder/Oktaeder/
  Ikosaeder): Ikosaeder-KIFS und polyedrisches Kaleidoskop als Faltkerne.
* **4D-gedrehtes Gitter** (`f4DLattice`): der Raum als Schnitt durch ein in 4D
  gefaltetes Gitter; die Drehung in xw/yw verwandelt Würfel stetig in Platten
  und Balken (nur Drehung, Spiegelung, Projektion: der Abstand bleibt sicher).

Quellen: [Lenstra/de Smit, Escher and the Droste effect](https://pub.math.leidenuniv.nl/~smitbde/papers/bridges-2005-desmit.pdf),
[Farris, Creating Symmetry (Scientific American)](https://www.scientificamerican.com/blog/guest-blog/mathematical-art-takes-a-fresh-look-at-wallpaper),
[Wallpaper Functions (Wolfram)](https://demonstrations.wolfram.com/WallpaperFunctions/),
[Bandmodell (Bridges 2019)](https://archive.bridgesmathart.org/2019/bridges2019-91.pdf),
[Hvidtfeldt, Kaleidoscopic Fractals](https://blog.hvidtfeldts.net/index.php/2010/06/folding-space-ii-kaleidoscopic-fractals/),
[Pseudo-Kleinian](https://www.imaginary.org/node/2364).

Noch nicht eingebaut (Kandidaten): Peirce-Quinkunx / Quadrat↔Kreis
(braucht Jacobi-elliptische Funktionen), Grenzmengen Kleinscher Gruppen
(Indra's Pearls; als Faltung zu teuer), Farris-Rosetten mit Farbdrehung.

## 7. Weiterdenken

* **Ketten als FX-Stufe (größter Hebel, braucht deine Entscheidung)**: Jede
  Szene läuft durch eine CombineShader-Stufe, die dieselbe Schnittstelle hat
  wie die Szenen (`tex0`/`tex1`/`interpolation`); `FxKaleidoscope` ist schon
  eine Ein-Stufen-Kette auf dem fertigen Szenenbild. Eine `FxChain` mit der
  gewürfelten Stufenmaschine machte **jede der ~1800 Szenen** zum Eingang
  einer Kette. Haken: Das Szenenbild, das die FX bekommt, hat keine
  Mip-Stufen (nur Fotos und Nachzieh-Puffer werden gemipmappt) — eine Kette
  flimmert ohne sie. Nötig wäre `glGenerateMipmap` auf dem Szenen-FBO, nur
  wenn die aktive FX es verlangt (etwa per `usesLod()` wie die anderen
  `uses…()`-Abfragen). FX laufen bei dir bewusst selten (0,002–0,005); ob
  eine Ketten-FX öfter kommen soll, ist eine Geschmacksfrage.

* **Kette als Gelände**: als Tunnelwand umgesetzt (ChainLabTunnel); ein
  Flug *über* ein Höhenfeld hätte einen Horizont und verletzt die
  Ursprungs-Kriterien — höchstens senkrecht von oben.
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
