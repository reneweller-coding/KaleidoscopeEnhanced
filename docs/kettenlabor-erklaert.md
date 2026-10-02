# Kettenlabor und Transformationen – wie es funktioniert

Stand 01.10.2026 (Branch `phos-cues`). Dieses Dokument erklärt, was die
Kettenlabore und die Transformationsketten sind, wie eine Kette aufgebaut ist,
was die Stufen A, B, C und D enthalten und warum, was „morphP“ und „Wandern“
bedeuten, wie die Musik eingreift und was die beiden Presets „Kettenlabor“ und
„Transformationen“ unterscheidet. Die Entwicklungsgeschichte steht in
[konzept-kettenlabor-2026-09-30.md](konzept-kettenlabor-2026-09-30.md).

---

## 0. Kurzfassung

* Eine **Transformation** verbiegt das Foto: Für jeden Bildpunkt auf dem
  Bildschirm rechnet sie aus, *welche Stelle des Fotos* dort zu sehen ist.
* Eine **Kette** sind bis zu vier solcher Transformationen hintereinander, je
  eine aus den Stufen **A** (globale Abbildung), **B** (Symmetrie),
  **C** (zweite Abbildung) und **D** (Verzerrung/Strömung).
* Ein **Labor** ist *eine* Szene, die bei jedem Start eine neue Kette würfelt
  (zehntausende Möglichkeiten) und sie während des Laufens mit der Musik
  weiterverändern kann. Das nenne ich **Wandern**.
* **morphP** ist der Knopf, der festlegt, *ob und wie stark* gewandert wird.
  In beiden Presets steht er auf 0,5–1, also: alles wandert, gesteuert von der
  App nach der Musik.
* Gespeichert wird nichts. Fest sind nur der Baukasten (die Klassenlisten im
  Shader) und die 41 von mir zusammengestellten **benannten Ketten**.

---

## 1. Die Grundidee: Transformationen verketten

Jede Szene des Kaleidoskops zeigt letztlich ein Foto. Eine Transformation ist
eine Funktion *Bildschirmpunkt → Fotopunkt*. Ein Kaleidoskop faltet den Winkel,
ein Tunnel macht aus dem Abstand zur Mitte die Tiefe, eine Spirale wickelt das
Bild logarithmisch auf. Weil jede Transformation einen Punkt auf einen Punkt
abbildet, kann man sie beliebig hintereinanderschalten: das Ergebnis der ersten
ist die Eingabe der zweiten.

Damit das immer gut aussieht, gelten drei Regeln für jede Transformation:

1. **Stetig**: Benachbarte Bildschirmpunkte landen auf benachbarten Fotopunkten
   (keine Risse). Deshalb sind Symmetrien als *Spiegelungen* gebaut. Ein
   Spiegel lässt seine Spiegelachse fest, also passt alles an der Faltkante
   zusammen.
2. **Nahtlos**: Zwischen den Stufen sorgt `mirrorUV` dafür, dass das Foto
   gespiegelt endlos weitergeht. Stufen, deren Ausgabe an einer Kante um eine
   ganze Fotobreite springt (etwa die Winkel-Kante bei Polarkoordinaten),
   bleiben dadurch unsichtbar.
3. **Ohne Sprünge in der Zeit**: Alles, was sich bewegt, läuft über
   aufsummierte Größen (Zeit, `audioAdvance`, `audioPhase`). Nie wird ein Wert
   direkt mit einem schwankenden Audiopegel multipliziert.

Die Kette wird pro Pixel ausgewertet. Danach kommt der **Look** (Foto, Relief,
Höhenlinien, Strömung, Leuchtkanten) und das **Farbfeld**.

---

## 2. Die vier Stufen A, B, C, D

Ursprünglich war die Kette als kleine Grammatik gedacht:
**Abbildung → Symmetrie → Abbildung → Verzerrung**. So kommt nie eine Kette
aus zwei Verzerrungen ohne Struktur heraus, und jede Kette hat ein Gerüst,
eine Ordnung, eine zweite Biegung und Bewegung. Seit Runde 5 ist die
Reihenfolge der vier Stufen selbst ein Knopf (Abschnitt 5). Die *Rollen* der
Stufen bleiben aber gleich.

| Stufe | Rolle | Kriterium für die Einordnung |
|---|---|---|
| **A – globale Abbildung** | Das Gerüst: ändert das Koordinatensystem der *ganzen* Ebene. | Die Abbildung organisiert das Bild grundlegend um. Sie erzeugt Zentren, Pole, Wiederholungen, Unendlichkeiten oder Fraktalränder. Dazu gehören Koordinatensysteme, komplexe Funktionen, Kugelprojektionen, hyperbolische Geometrie, iterierte Abbildungen (Dynamik). |
| **B – Symmetrie** | Die Ordnung: faltet die Ebene mit Spiegeln in einen Grundbereich. | *Nur Spiegelungen* (und Skalierungen bei Fraktalfaltungen). Ergebnis ist ein symmetrisches Muster: Kaleidoskope, Tapetengruppen, aperiodische Kachelungen, Fraktalfaltungen, Spiegel an Kreisen. |
| **C – zweite Abbildung** | Die zweite Biegung: verformt, was A und B gebaut haben. | Mildere, meist konforme Abbildungen (winkeltreu, also „weich“), oft auf eine Gegend beschränkt: Linsen, Fischauge, Potenzen, Cayley, Joukowski. Dazu kommen Spirale/Tunnel/Kaleidoskop als zweite Chance. |
| **D – Verzerrung** | Die Bewegung: ein kleines Verschiebungsfeld, das Strukturen biegt, aber nicht umbaut. | Kleine Auslenkung, meist zeitabhängig: Strömungen (Wirbel, Konvektion, Strömungsmechanik-Lehrbuchfälle), Wellen. Wirkt „wie Flüssigkeit“. |

**Überschneidungen sind Absicht.** Kaleidoskop gibt es in A, B und C, Tunnel und
Spirale in A und C. Je nach Stufe steht dieselbe Transformation an einer anderen
Stelle der Kette und wirkt dann anders: Ein Kaleidoskop in A faltet den
Bildschirm, in C faltet es das schon gebaute Muster.

**Grenzfälle**, die man auch anders einordnen könnte:

* *Farris-Tapete, Quasikristall, Jacobi-Tapeten* (A): Das Ergebnis ist ein
  symmetrisches Muster. Gebaut ist es aber als *Funktion* (Wellensummen,
  elliptische Funktionen), nicht als Faltung. Es ordnet die ganze Ebene neu,
  deshalb A.
* *Penrose-, Ammann-Beenker-, 12er-Quasikristall-Spiegel* (B): aperiodisch, aber
  echte Spiegelfaltungen, deshalb B.
* *Lorentz-Boost* (C): eine lineare „hyperbolische Drehung“. Zu schwach für A, zu
  global für D.
* *Drehung* (D): Die ganze Bildebene dreht sich sanft. Das ist keine
  Umordnung, also Verzerrung.

### Legende der Tabellen

* **Pos.** = Position in der Energie-Ordnung (0 = ruhigste, siehe Abschnitt 4).
* **Name** = wie die Shader-Info (Taste `v`) es anzeigt.
* ⭕ = **Öffnung**: Das Bild strömt endlos in einen Punkt hinein oder heraus
  (Abschnitt 7).
* T = im **Tunnel-Labor** nicht enthalten (zu teuer, Abschnitt 11).
* 3 = in der Farbkette des **3D-Labors** nicht enthalten.

### Stufe A – globale Abbildung (58 Klassen)

| Pos. | Name | Was sie macht | |
|---|---|---|---|
| 0 | none | Identität: A tut nichts, die Kette beginnt bei B. | |
| 1 | Farris frieze | Farris-Fries: ein Bandmuster, periodisch entlang des Bandes, die Bänder gestapelt. | T |
| 2 | burning ship | „Brennendes Schiff“: Mandelbrot mit Beträgen. | T |
| 3 | Chirikov map | Chirikov-Standardabbildung (gestoßener Rotor): Inseln und Chaos. | T |
| 4 | cubic Julia | Kubische Julia z³ + k. | T |
| 5 | Weierstrass p | Weierstraß-℘-Funktion: ein Gitter aus Polen. | T |
| 6 | Jacobi sn/dn wallpaper | Die Schwesterfunktionen sn/dn (andere Pole und Nullstellen). | T |
| 7 | wandering poles | Summe aus Polen: Blüten um jeden wandernden Pol. | T |
| 8 | Zaslavsky web | Zaslavsky-Netz: Stoß und Drehung um 2π/q, ein q-zähliges „stochastisches Netz“. | T |
| 9 | Henon map | Hénon-Abbildung, einige Schritte. | T |
| 10 | Ikeda map | Ikeda-Abbildung (Laser im Ringresonator): Wirbelstruktur. | T |
| 11 | circle inversion | Kreisspiegelung: innen und außen vertauscht. | |
| 12 | Farris wallpaper | Farris-Tapetenfunktion: weiches, symmetrisches Muster, das die Ebene kachelt (14 Symmetriegruppen). | T |
| 13 | kaleidoscope | Klassisches Kaleidoskop, 5–9 Spiegel, dreht sich. | |
| 14 | complex sine | Komplexer Sinus: ein Gitter aus Sattelpunkten. | |
| 15 | tan lattice | tan z: Streifen, jeder eine ganze Kugel aus Bild zwischen zwei Polen. | |
| 16 | Mandelbrot map | Mandelbrot-Iteration, einige Schritte. | T |
| 17 | Jacobi cn wallpaper | Jacobi-Funktion cn als doppelt periodische Tapete. | T |
| 18 | Gumowski-Mira | Gumowski-Mira-Abbildung (Teilchenbahnen am CERN), einige Schritte. | T |
| 19 | bipolar Droste | Spiral-Droste zwischen zwei Löchern. | ⭕ |
| 20 | Phoenix Julia | Phoenix-Julia: mit Gedächtnisterm. | T |
| 21 | breathing sphere | Riemann-Kugel, durch eine Kugelflächenfunktion ausgebeult, drehend. | |
| 22 | Klein invariants | Kleins Tetraeder-/Oktaeder-Invarianten: rationale Funktionen mit Platonischer Symmetrie. | T |
| 23 | polar unwrap | Polarkoordinaten: Winkel nach rechts, Abstand nach oben – Strahlen aus einer Mitte. | |
| 24 | Blaschke product | Blaschke-Produkt: Die Einheitsscheibe ist mehrfach um wandernde Nullstellen gewickelt. | T |
| 25 | hyperbolic Droste | Eschers Spiral-Droste, zusätzlich in eine hyperbolische {p,q}-Kachelung gefaltet. | ⭕ T |
| 26 | quasicrystal | Quasikristall (de Bruijn): n Wellen in n Richtungen, n-zählig, wiederholt sich nie. | T |
| 27 | Chebyshev fold | Tschebyschow-Polynom: die Ebene gefaltet wie cos(n·acos z). | |
| 28 | hyperbolic band | Dieselbe Geometrie im Bandmodell: eine endlose hyperbolische Kachelleiste. | T |
| 29 | hyperbolic half-plane | Hyperbolische Kachelung in der oberen Halbebene, die am Horizont entlangkriecht. | T |
| 30 | Newton map | Newton-Verfahren für zⁿ = w: n Einzugsgebiete mit fraktalen Rändern. | T |
| 31 | magnet map | Magnet-Fraktal (Ising-Modell), einige Iterationen. | T |
| 32 | complex exponential | Komplexe Exponentialfunktion: Bänder werden zu Kreisen. | |
| 33 | Julia map | Julia-Abbildung z² + k, k wandert am Rand der Mandelbrot-Menge. | T |
| 34 | Moebius stream | Möbius-Abbildung mit zwei wandernden Polen. | |
| 35 | sunflower spirals | Zwei gekreuzte Spiralscharen wie die Kerne einer Sonnenblume. | |
| 36 | cardioid coordinates | Kardioid-Koordinaten (der Hauptkörper der Mandelbrot-Menge aufgerollt). | |
| 37 | zeta partial sum | Teilsumme der Riemannschen Zetafunktion: ein paar interferierende Spiralen. | T |
| 38 | Cassini ovals | Cassinische Ovale um zwei Punkte (bei kritischer Größe eine Lemniskate, die „liegende Acht“). | |
| 39 | Peirce quincuncial sphere | Kugel durch Peirces quinkunziale Projektion: eine Quadratkachelung. | T |
| 40 | rotating Mercator | Der Bildschirm ist die Mercator-Karte einer drehenden Kugel mit dem Foto darauf. | |
| 41 | hyperbolic spiral | Hyperbolische Spirale r = a/θ: ein Tunnel mit gewundenen Ringen. | ⭕ |
| 42 | Escher spiral Droste | Eschers „Bildergalerie“-Droste (Lenstra/de Smit): Eine Umdrehung ist ein Zoomschritt. | ⭕ |
| 43 | loxodromic stream | Loxodromische Strömung: Bild schraubt sich spiralförmig von Pol zu Pol. | ⭕ |
| 44 | Archimedean spiral | Archimedische Spirale: gleichmäßig weite Arme. | |
| 45 | hyperbolic Moebius flow | Bild strömt auf Kreisbögen von einem Fixpunkt zum anderen. | ⭕ |
| 46 | elliptic coordinates | Elliptische Koordinaten um zwei Brennpunkte: konfokale Ellipsen und Hyperbeln. | |
| 47 | theta wave | Jacobi-Thetafunktion mit wanderndem Parameter: quasiperiodische Wellen. | T |
| 48 | parabolic stream | Parabolische Möbius-Strömung: Kreise, die sich alle in einem Punkt berühren. | ⭕ |
| 49 | little planet | Das Foto als Panorama auf einer drehenden Kugel, stereografisch gesehen („kleiner Planet“). | |
| 50 | Droste zoom | Droste-Zoom: Das Bild wiederholt sich nach innen in jeder Größe, der Zoom läuft endlos. | ⭕ |
| 51 | parabolic coordinates | Parabolische Koordinaten: ineinander liegende Parabeln, gespiegelt. | |
| 52 | rotating Riemann sphere | Ebene auf die Riemann-Kugel gehoben, gedreht, zurückprojiziert: Bild strömt von Pol zu Pol. | |
| 53 | log-polar spiral | Logarithmische Spirale mit 2–8 Armen, zoomt endlos. | ⭕ |
| 54 | sphere kaleidoscope | Ein Kaleidoskop auf einer drehenden Kugel (Polyedersymmetrie). | T |
| 55 | tunnel | Klassischer Tunnel: Winkel herum, 1/r als Tiefe. | ⭕ |
| 56 | bipolar stream | Bipolare Koordinaten: Bild strömt von einem Pol zum anderen. | ⭕ |
| 57 | hyperbolic Poincare tiling | Hyperbolische Kachelung in der Poincaré-Scheibe (wie Eschers „Kreislimit“). | T |

### Stufe B – Symmetrie (23 Klassen)

| Pos. | Name | Was sie macht | |
|---|---|---|---|
| 0 | none | Keine Symmetrie. | |
| 1 | mirror line | Eine einzelne, langsam drehende Spiegelachse. | |
| 2 | origami folds | Bis zu vier Faltlinien, die sich langsam drehen (wie Papierfalten). | |
| 3 | curved kaleidoscope | Kaleidoskop mit Spiegeln aus Kreisbögen (hyperbolisch). | |
| 4 | p4m lattice | Quadratisches Spiegelgitter (Tapetengruppe p4m). | |
| 5 | p6m lattice | Sechseckiges Spiegelgitter (p6m). | |
| 6 | Sierpinski fold | Sierpiński-Faltung: drei Spiegel eines Dreiecks, dann ×2, wiederholt. | T |
| 7 | Pythagoras-tree fold | Pythagoras-Baum-Faltung. | T |
| 8 | Pappus chain | Pappus-Kette: endlose Kette von Kreisen im Arbelos. | |
| 9 | Steiner kaleidoscope | Kaleidoskop durch eine Kreisspiegelung gesehen: Spiegel werden Kreise. | |
| 10 | Vicsek fold | Vicsek-Kreuz-Faltung. | T |
| 11 | Levy C fold | Lévy-C-Kurven-Faltung. | T |
| 12 | kaleidoscope | Kaleidoskop, 5–9 Spiegel. | |
| 13 | Ammann-Beenker mirror | Ammann-Beenker-Kachelung: aperiodisch, achtzählig. | T 3 |
| 14 | Penrose mirror | Penrose-Kachelung als Spiegel: aperiodisch, fünfzählig. | T 3 |
| 15 | 12-fold quasicrystal mirror | Zwölfzähliger Quasikristall-Spiegel. | T 3 |
| 16 | spiral kaleidoscope | Kaleidoskop, dessen Sektoren mit dem Abstand verdreht sind. | |
| 17 | Schottky mirror | Schottky-Gruppe: Spiegelungen an vier Kreisen. | T |
| 18 | modular group mirror | Die Modulgruppe als Spiegelgruppe: Dreiecke, die zum Horizont hin unendlich klein werden. | T |
| 19 | Koch fold | Koch-Schneeflocken-Faltung. | T |
| 20 | iterated fold | Iterierte Faltung (Kali-artig): wiederholt spiegeln und skalieren. | |
| 21 | Apollonian inversion fold | Apollonische Packung: Kreisspiegelungen im Wechsel (wie „Indra's Pearls“). | T |
| 22 | p3m1 triangle mirror | Gleichseitiges Dreiecks-Spiegelgitter (p3m1). | |

Keine B-Klasse hat eine Öffnung. Kaleidoskope haben zwar eine Mitte, aber
eine *ruhende*. Sie fliegen nicht in einen Punkt.

### Stufe C – zweite Abbildung (18 Klassen)

| Pos. | Name | Was sie macht | |
|---|---|---|---|
| 0 | none | Keine zweite Abbildung. | |
| 1 | lens | Lupe: Ausbeulen oder Einschnüren in einem Kreis, pulsierend. | |
| 2 | zone lens | Zonenlinse: Vergrößerung schwingt mit r² (wie eine weiche Fresnel-Linse). | |
| 3 | Farris rosette | Farris-Rosette: weiche n-zählige Rosette. | |
| 4 | fisheye | Fischauge / Tonnenverzeichnung. | |
| 5 | gravitational lens | Gravitationslinse (Punktmasse): Einstein-Ring. | |
| 6 | binary lens | Doppellinse: zwei kreisende Massen, Kaustiken. | |
| 7 | Lorentz boost | Lorentz-Boost: entlang der Diagonalen gestaucht und gestreckt. | |
| 8 | blossom | Blüte: Radius schwillt mit dem Winkel, n Blütenblätter. | |
| 9 | inversion | Kreisspiegelung. | |
| 10 | Joukowski map | Joukowski-Abbildung (Tragflächenprofil). | |
| 11 | kaleidoscope | Kaleidoskop (gegenläufig drehend). | |
| 12 | log vortex | Logarithmischer Wirbel: Drehung wächst mit log r. | |
| 13 | Cayley transform | Cayley-Transformation: Halbebene ↔ Scheibe. | |
| 14 | mirrored power | z^α mit gespiegeltem Winkel (α wandert, z. B. die Wurzel-Faltung). | |
| 15 | complex square | Komplexes Quadrat z²: jeder Winkel verdoppelt. | |
| 16 | spiral | Logarithmische Spirale, zoomt. | ⭕ |
| 17 | tunnel | Tunnel. | ⭕ |

### Stufe D – Verzerrung (20 Klassen)

| Pos. | Name | Was sie macht | |
|---|---|---|---|
| 0 | none | Keine Verzerrung. | |
| 1 | turning | Sanfte Drehung des ganzen Bildes, hin und her. | |
| 2 | bend | Biegung: Drehwinkel wächst quer über das Bild. | |
| 3 | convection cells | Konvektionszellen (sechseckiges Wellenfeld). | |
| 4 | cylinder flow | Umströmung eines Zylinders mit Zirkulation. | |
| 5 | curl flow | Curl-Rauschen: divergenzfrei, wirbelt wie eine Flüssigkeit. | T |
| 6 | dipole field | Feldlinien eines Dipols. | |
| 7 | twirl | Strudel um eine Mitte. | |
| 8 | Kelvin-Helmholtz rolls | Kelvin-Helmholtz: eine Scherschicht rollt sich zu Wellen auf. | |
| 9 | vortex pair | Zwei umeinander kreisende Wirbel. | |
| 10 | Taylor-Green vortices | Taylor-Green-Wirbel: ein Schachbrett aus Wirbeln, atmend. | T |
| 11 | domain warp | Domain Warp: Rausch-Verschiebung. | T |
| 12 | wave interference | Interferenz zweier Wellenquellen. | |
| 13 | double gyre | Doppelwirbel (das Lehrbuchbeispiel einer zeitperiodischen Strömung). | T |
| 14 | ripple | Kreiswellen aus einer Mitte. | |
| 15 | Gerstner waves | Gerstner-Wellen: drei trochoidale Wasserwellen. | |
| 16 | vortex street | Wirbelstraße: vier Wirbel wechselnden Drehsinns ziehen vorbei. | T |
| 17 | Karman street | Kármánsche Wirbelstraße hinter einem Hindernis. | T |
| 18 | gravitational wave | Gravitationswelle: Plus- und Kreuzpolarisation laufen nach außen. | |
| 19 | shear wave | Scherwelle (Sinus-Versatz). | |

---

## 3. Ein Knopf = Klasse + Untervariante

Jede Stufe hat *einen* Knopf (`chainAP`, `chainBP`, `chainCP`, `chainDP`,
Wert 0…1). Er wird mit der Anzahl der Klassen multipliziert:

* **ganzzahliger Teil** → Position in der Energie-Ordnung → Klasse,
* **Nachkomma-Teil** → **Untervariante**: Zahl der Spiegel (5–9), Spiralarme
  (2–8), Gittergröße, {p,q} der hyperbolischen Kachelung, Typ der
  Farris-Tapete usw.

*Beispiel:* `chainAP = 0,4137` → 0,4137 × 58 = 23,99 → Position 23 = rotating
Riemann sphere, Untervariante 0,99 (oberes Ende ihrer Parameter).

So kann ein einziger Zufallswert eine Klasse *und* ihre Ausprägung wählen.
Und die Musik kann über „hohe oder niedrige Werte“ die Gegend der Liste
ansteuern (nächster Abschnitt).

---

## 4. Die Energie-Ordnung

Die Klassen jeder Stufe sind von **ruhig** (Position 0 = none) bis **energisch**
sortiert – seit 02.10.2026 **gemessen** (`Tools/chain_class_stats.py`,
`Tools/scenegen/apply_energy_order.py`): jede Klasse allein, im Editor
gerendert, Energie = Bewegung (Bildänderung über 2 s) + ½ · Detail (mittlerer
Helligkeitsgradient), je Stufe normiert. Fest bleiben Position 0 und die
„schwachen“ Positionen (B 1–2, C 1, D 1–2), über denen das ruhige Gitter
einblendet.

Die Messung widerspricht der alten Handordnung deutlich (Rangkorrelation A
−0,37, B 0,21, C 0,69, D 0,20): Am ruhigen Ende von A stehen jetzt die
chaotischen Abbildungen (Burning Ship, Chirikov, Julia, Hénon) – sie bilden
große, kaum bewegte Flächen –, am energischen die strömenden Öffnungen
(Tunnel, bipolarer Strom, Poincaré-Kachelung, log-polare Spirale), die viel
Bild pro Sekunde bewegen. „Energie“ heißt jetzt sichtbare Bewegung und
Unruhe, nicht Komplexität.

Wofür die Ordnung gebraucht wird: Beim Wandern wählt die App das Ziel einer
Stufe als `0,08 + 0,84 × Energie ± Zufall`. Ruhige Musik landet also im
ruhigen Teil der Liste, energische Musik im wilden.

---

## 5. Die Reihenfolge (orderP)

Die vier Stufen sind **nicht vertauschbar**: Dieselben vier Transformationen
ergeben in anderer Reihenfolge ganz andere Bilder. Beispiel mit Spirale,
p6m-Gitter, Kreisspiegelung und Verzerrung:

* Spirale zuerst → ein zur Spirale aufgewickeltes Sechseckparkett,
* Gitter zuerst → ein Sechseckgitter, in jeder Zelle eine Spirale,
* Kreisspiegelung zuerst → Spiegelblasen im Sechseckraster.

Die erste Stufe wirkt auf den Bildschirm selbst und bestimmt das große Bild.
Die späteren wirken im schon verformten Raum und vervielfältigen sich
entsprechend. Deshalb gibt es den Knopf `orderP` mit allen **24 Reihenfolgen**
(0 = A→B→C→D). Die Taste `v` zeigt die aktuelle Reihenfolge an.

* Im **2D-Labor** und in **FxChain** wird die Reihenfolge gewürfelt und wandert mit.
* In der Farbkette des **3D-Labors** wird sie gewürfelt, wandert aber nicht.
  Eine Reihenfolge-Überblendung rechnet zwei ganze Ketten, und die Farbkette
  läuft dort schon bis zu sechsmal je Pixel.
* Im **Tunnel-Labor** ist sie fest A→B→C→D.

---

## 6. Kürzere Ketten, schwache Ketten, nie das nackte Foto

* **none** in jeder Stufe ist die Identität. Würfelt z. B. B und D „none“,
  ist die Kette nur zwei Stufen lang. Kürzere Ketten entstehen so von selbst.
* Manche Klassen tun mit ihren Untervarianten fast nichts (etwa eine einzelne
  Spiegelachse ohne weitere Stufen). Der Shader schätzt, wie viel die Kette
  insgesamt bewirkt (`gIdW`). Bleibt fast nichts übrig, blendet weich ein
  **flaches Sechseckgitter** ein. Das nackte Foto erscheint nie.
  (Bis 01.10. war das ein Kaleidoskop; das gab zu viele Rosetten.)

---

## 7. Die Öffnungs-Regel (seit 01.10.)

Klassen, die das Bild **endlos in einen Punkt strömen lassen**, sind in den
Tabellen mit ⭕ markiert: Tunnel, Droste-Zooms, Log-Polar- und hyperbolische
Spirale sowie die Pol-Strömungen (parabolisch, hyperbolisch, bipolar,
loxodromisch). Dort entsteht die dunkle Öffnung, in die man immerzu fliegt.

In den flachen Laboren (2D-Labor, FxChain) gilt:

* **Höchstens eine** Stufe darf eine Öffnung tragen.
* Und auch die nur **jedes zweite Mal**. Beim Würfeln entscheidet ein Hash des
  Knopfwerts, beim Wandern der eigene Zufallsstrom der App.
* Fällt eine Öffnung weg, rückt die Stufe auf die **nächstgelegene Klasse ohne
  Öffnung** (gleiche Untervariante, ähnliche Energie).

Rosetten und Kaleidoskope bleiben davon unberührt; ihre Mitte steht still.
Im Tunnel-Labor gilt die Regel nicht, das ist ja per Definition ein Tunnel.

---

## 8. Looks und Farbe

| Knopf | Wirkung |
|---|---|
| `styleP` – Look | 5 Looks: **photo** (das verformte Foto), **relief** (beleuchtetes Relief, Licht kreist langsam), **contour lines** (leuchtende Höhenlinien der Helligkeit, fließen langsam „bergauf“), **flow** (Rauschen, entlang der Höhenlinien gekämmt), **glowing edges** (Kanten als Neon). Die Kanten entstehen *nach* der Kette, sind also die Kanten des verwandelten Bildes. |
| `paletteP` | Mischung zwischen Fotofarben und einem **Farbfeld**, dessen Farbton den Koordinaten der Kette folgt und mit der Musik wandert. |
| `hueP` | Grundfarbton des Farbfelds. |
| `speedP` | Fließgeschwindigkeit. |
| `detailP` | Texturschärfe (Mipmap-Bias). |

Das Foto selbst wird nur als **RGB** gelesen, die Helligkeit daraus für
Relief, Höhenlinien und Kanten.

---

## 9. morphP und „Wandern“

**Wandern** heißt: Die Kette ändert sich *während* die Szene läuft. Eine Stufe
wechselt ihre Klasse (oder Untervariante), der Look wechselt, im 3D-Labor auch
Raum, Kern oder Körper. Ein Wechsel ist **nie ein Schnitt**, sondern eine
**Überblendung**: Für einige Sekunden rechnet der Shader die Kette mit der alten
*und* der neuen Klasse und mischt beide Ergebnisse. Beide sind stetig, also
springt nichts. Es sieht aus, als ob das eine Muster ins andere schmilzt.

`morphP` wird bei jedem Start gewürfelt und legt fest, wie gewandert wird:

| morphP | Verhalten | Wer steuert |
|---|---|---|
| 0 – 0,15 | **fest**: Die gewürfelte Kette bleibt, nur Fluss, Drehung und Farben laufen. | – |
| 0,15 – 0,5 | **eine Stufe wandert** (welche, folgt aus dem Wert: A, B, C oder D). | Der **Shader** selbst: Takt aus Zeit + `sceneAdvance` (steigt mit Spektralfluss und Harmoniewechseln), neue Klasse per Hash. Ohne Musik etwa alle 80 s ein Wechsel. |
| 0,5 – 1 | **alles wandert**: A–D und der Look, im 2D-Labor auch die Reihenfolge, im 3D-Labor auch Raum, Kern und Körper. | Die **App** (`EffectShader::stepChainWalk`), nach der Musik. |

In **beiden Presets** ist `morphP` auf 0,5–1 eingeengt: Es wandert immer
alles, und die App entscheidet nach der Musik. In den Genre-Presets (Club,
Psychedelic …) kann ein Labor auch fest oder einstufig laufen.

### Wie die App beim Wandern auf die Musik reagiert

| Ereignis in der Musik | Reaktion |
|---|---|
| **neuer Songabschnitt** | Stufe A (das Gerüst) wechselt, Blende ca. 4 s. Mit 50 % wechselt auch der Look (6 s), im 3D-Labor mit 60 % Raum oder Kern (8–14 s). |
| **wiederkehrender Abschnitt** (z. B. 2. Refrain) | Alle Stufen laufen zurück zu der Kette, die dieser Abschnitt beim ersten Mal hatte. Das Bild „erinnert“ sich an den Refrain. |
| **Drop** | Stufe A (das Gerüst), Stufe D (Verzerrung) und der Look wechseln schnell, in etwa einem Takt. |
| **jede 8-Takt-Phrase** (bei stabilem Beat) | Abwechselnd eine **neue Variante** einer Transformation (dieselbe Klasse mit anderer Spiegelzahl, Armzahl, Gittergröße – die Transformation selbst verwandelt sich) und eine **neue Transformation** für die Stufe, die am längsten steht. Blende über zwei Takte. |
| **Build-up** | Das Wandern wird schneller, die Ziele rücken ans energische Ende der Listen. |
| **Harmoniewechsel** (Akkord/Tonart, Schwelle 0,55) | Stufe B (Symmetrie) oder C (zweite Abbildung) wechselt, in 4–8 s. Danach 12 s Pause, und nur, wenn gerade nichts überblendet. |
| **sonst** | Die Stufe, die am längsten steht, wechselt, wenn ihre Haltezeit um ist: 70 s bei ruhiger, 30 s bei energischer Musik. Look ×1,6, 3D-Struktur ×1,4 länger. Blende 5–10 s, Struktur 8–14 s. |

Dazu kommen drei Regeln:

* **Wohin**: Das Ziel liegt bei `0,08 + 0,84 × Energie ± 0,25` auf der
  Energie-Ordnung der Stufe. Energie = Erregung (Arousal), über 8 s geglättet.
* **Wie schnell**: Haltezeiten und Blenden laufen in **Musik-Tempo**
  `0,35 + 0,9 × Kurzzeit-Energie + 1,2 × Spektralfluss` (0,25 … 2,5). Leise
  Passagen lassen eine Blende kriechen, ein Ausbruch treibt sie an. Bei
  stabilem Beat werden die Blendzeiten auf ganze Schläge gerundet (die
  Sekunden oben gelten für 120 BPM).
* **Immer nur eine Strukturstufe** im 3D-Labor überblendet gleichzeitig, weil
  dann zwei ganze 3D-Welten gerechnet werden.

Ein wanderndes Labor wird vom Szenenplaner **nicht** bei Abschnittswechseln
oder Drops weggeschnitten. Es reagiert ja selbst darauf. Die Taste `n` und die
Fernbedienung wirken weiterhin.

### Was die Musik zusätzlich in jedem Bild steuert (Shader)

| Signal | Wirkung |
|---|---|
| `audioAdvance` (aufsummiert) | der Fluss durch die Kette, im 3D-Labor die Fluggeschwindigkeit |
| `audioPhase` (aufsummiert) | Kaleidoskope drehen sich, das Farbfeld wandert |
| `audioSpread` | Stärke der verzerrenden Stufen (D, Linsen) |
| `audioKick` | Kanten leuchten auf (nur Licht, keine Bewegung) |
| `audioMode` | Tönung und Palette: Moll kühl, Dur warm |
| `audioSwell` (langsam) | Relieflicht und Sättigung, im 3D die Weite der Flugröhre |

Kamera, Zoom und Drehung folgen **nie** direkt der Musik (keine Erschütterungen).

---

## 10. Die drei Labore und FxChain

### ChainLab2D – das 2D-Labor
Alles aus den Abschnitten 2–9, voller Umfang: 58 × 23 × 18 × 20 Klassen,
Untervarianten, 24 Reihenfolgen, 5 Looks.

### ChainLabTunnel – das Tunnel-Labor
Die gewürfelte 2D-Kette als **Wand eines Tunnels**, ihre Helligkeit als echtes
Relief, die Röhre windet sich. Weil die Kette hier in *jedem Schritt* des
Raymarchings (Strahlverfolgung) ausgewertet wird, läuft das Tunnel-Labor mit
**fester Reihenfolge A→B→C→D** und **ohne die teuren Klassen** (T in den
Tabellen): Fraktal-Iterationen, elliptische Funktionen, hyperbolische
Kachelungen, Quasikristalle, Strömungen mit Schleifen. Mit ihnen fiel es auf
28–54 fps, ohne sie läuft es mit 105–121.

### ChainLab3D – das 3D-Labor
Eine geraymarchte Welt aus drei weiteren gewürfelten Stufen, eingefärbt mit
einer 2D-Kette (A–D, Reihenfolge gewürfelt, aber nicht wandernd, ohne die drei Quasikristall-Spiegel):

* **Raum** (20): wie die Welt gekachelt oder verbogen ist: gespiegeltes Gitter,
  Oktaeder-/Ikosaeder-/Sechseck-Gitter, gerollte Welt, 4D-gedrehtes Gitter,
  log-sphärisches und verdrilltes 3D-Droste, log-zylindrisches Droste,
  drehendes Gitter, gebogene Zellen, um einen Ring gewickelte Welt,
  hyperbolischer Halbraum, verdrilltes Gitter, Gyroid- und Rausch-verzerrtes
  Gitter, Helix, Doppelhelix, invertiertes Gitter, polarer Ringtunnel.
* **Faltkern** (22): was in jeder Zelle gefaltet wird: kein Kern, Ebenenfaltung,
  Polyeder-Kaleidoskop, Kugelinversions-Boxfaltung, sphärisches KIFS,
  apollonische Kugelpackung, Mandalay-Box, hyperbolische Wabe, Kleinsche und
  Pseudo-Kleinsche Faltung, Amazing Surface, Mandelbulb, Kaliset, Tetraeder-,
  Ikosaeder-, Dodekaeder-, Oktaeder- und verdrilltes Oktaeder-KIFS,
  gemischtes Sierpiński, Sierpiński-Oktaeder, Menger- und Kreuz-Menger-Schwamm.
* **Körper** (22): was am Ende dasteht: Kugeln, Pillen, Superquadriken,
  Oktaeder, Rhombendodekaeder, Ikosaeder, Hohlkugeln, Tori, Kettenglieder,
  verschlungene Ringe, Gyroid-Membran, Schwarz-P/D-, Neovius- und
  Lidinoid-Minimalflächen, Blöcke, verdrillte Säulen, Stabgitter,
  Sterntetraeder, Steinmetz-Körper, Kreuze, Zahnräder.
* Weitere Knöpfe: `solidP` (Farbkette als Volumentextur, Zeit als dritte Achse),
  `reliefP` (Oberfläche beult sich mit der Helligkeit der Farbkette),
  `camP` (Kamerablick, s. u.).

**Kamera:** Die Kamera fliegt auf einer geschwungenen Bahn. Eine Röhre um die
Bahn wird aus jedem Körper ausgeschnitten, deshalb gibt es nie eine Kollision.
Seit 01.10. gibt es **sieben Blicke**: geradeaus, rechtes Fenster, schräg
unten, linkes Fenster, schräg oben, Schweben (Flug fast still, Blick dreht
sich langsam rundum), orthografisch (parallele Strahlen, ein schräger
Querschnitt zieht vorbei). `camP` wählt den ersten. Dann hält die App jeden
Blick 2–5 min und schwenkt in 40–60 s zu einem anderen, nur nach der Uhr.
Die App summiert auch die Flugposition auf, damit Schweben den Flug ohne
Sprung bremsen kann.

### ChainSlice3D – der Raumschnitt (Prototyp seit 01.10.)
Die 3D-Kette ohne Raymarching: Der Bildschirm ist eine **Ebene durch die
Welt** des 3D-Labors (dieselben Raum-, Faltkern- und Körperklassen). Jeder
Bildpunkt ist ein Raumpunkt, der die Kette einmal durchläuft, statt eines
Marschs mit bis zu 100 Schritten.

* `layerP`: 1–8 Ebenen hintereinander. Gezeigt wird die erste, die Materie
  schneidet. Durch ihre Löcher sieht man die tieferen, wie ein Stapel
  geschnittener Platten.
* Materie trägt die Farbkette (wie im 3D-Labor auf drei Projektionsebenen),
  Luft bleibt gedämpft. Die Schnittkanten leuchten über den Gradienten der
  Abstandsfunktion.
* Die Ebene wandert mit dem Flug durch die Welt. Die Kamerablicke der App
  werden zu Schnittrichtungen (quer, längs, diagonal 1-1-1, langsam
  drehend …), gewechselt wird nur nach der Uhr. In der Ebene dreht sie sich
  langsam (eine Umdrehung in 7 min).
* Der Raumzeit-Schnitt der 2D-Kette selbst (ohne Welt) ist seit 02.10.
  die Stellschraube `tiltP` der 2D-Labore (s. „Die Zeitneigung“).
* Leistung: 117–120 fps, GPU 2,9 ms (3D-Labor 4–5 ms). Jede neue
  Weltkombination kostet einmal ~20–30 ms (wie im 3D-Labor).
* Bekannt: Sehr feine Faltkerne zerfallen im Schnitt zu Splittern und
  bleiben dunkel.

### Die Zeitneigung (`tiltP`, seit 02.10.)
Eine 2D-Kette, deren Parameter mit der Zeit laufen, ist ein Volumen
(x, y, t); jedes Labor zeigte bisher einen Moment davon. `tiltP` kippt den
Schnitt: Die Zeit der Kette ist t₀ + a·x + b·y, jede Bildstelle zeigt einen
anderen Moment – eine Zeitwelle, die über das Bild läuft. Die Richtung dreht
sich langsam (nur nach der Uhr), die Stärke folgt dem langsamen Swell der
Musik. Unter 0,15 aus. Im 2D-Labor, Tunnel-Labor (auf der Wand) und in
FxChain, ohne Mehrkosten: jeder Durchgang verschiebt dieselbe Zeit je Pixel.
Wandert das Labor, folgt die Richtung den **Musikabschnitten**: Jeder neue
Abschnitt bekommt eine deutlich andere Richtung, ein wiederkehrender seine
alte; die App gleitet in etwa 4 s dorthin (kürzester Weg, nie ein Sprung).

### Nachglühen (`glowP`) und atmende Verzerrung (seit 02.10.)
* `glowP` (alle Kettenlabore): das zuletzt fertig gezeigte Bild als
  abklingender Phosphor-Schleier – max(neu, 0,78 · vorher). Langsame Ketten
  ziehen weiche Spuren, schnelle Wechsel flimmern kurz nach. Unter 0,15 aus;
  die Presets würfeln −0,6..1, also etwa jeder zweite Wurf ohne.
* Die Verzerrungsstufe D atmet mit dem langsamen Swell der Musik: 55 % ihrer
  Verschiebung in leisen, 100 % in vollen Passagen. Ausgenommen sind „keine“,
  Drehung und Twirl (keine Rotation auf Musik). Die Untervarianten bleiben
  unangetastet, weil viele Klassen daraus ganzzahlige Arm- oder Gitterzahlen
  machen.
* Raumschnitt: Die Ansicht rückt umso näher, je feiner der Faltkern faltet
  (Menger auf 35 %, Kleinian/Apollonian 42 %, ohne Kern 110 %); der
  Ebenenabstand geht mit, die Materie-Kante ist ein Pixel breit.
* Raumschnitt, Luft: In Materienähe leuchtet sie als Hof (etwa 25 Pixel
  breit), sonst bleibt sie gedämpft – auch eine in dünne Splitter zerfallene
  Welt bleibt lesbar.
* Raumschnitt durch 4D (`hyperP`): Die Ebene kommt fast zur Ruhe, die Zeit
  der Welt (Faltwinkel, Drehungen) läuft schneller – die Formen wachsen,
  teilen und verbinden sich an Ort und Stelle. Etwa jeder zweite Wurf.
* 3D-Labor mit stetigem Beat: Weltwechsel (Raum/Kern/Körper) warten auf die
  nächste Phrasengrenze, und das Ende einer Weltblende ebenfalls – der
  einmalige erste Draw einer neuen Weltfassung fällt so auf den Schlag.

### FxChain – die Kette als Nachbearbeitung
Dieselbe 2D-Stufenmaschine, aber als **FX-Stufe**: Sie verformt nicht das Foto,
sondern das *fertige Bild einer beliebigen anderen Szene*. Dafür bekommt das
Szenenbild Mipmaps (nur wenn diese FX aktiv ist).

---

## 11. Benannte Ketten

Neben den Laboren gibt es **41 fest komponierte Ketten**: 36 in 2D (`Chain…`)
und 5 in 3D (`Chain3D…`). Jede ist eine bestimmte Kombination, die ich gebaut
und einzeln angesehen habe. Sie würfeln keine Stufen und wandern nicht. Nur
Fluss, Drehung, Farbe und Look laufen (Knöpfe `styleP`, `speedP`, `detailP`,
bei 3D auch `paletteP` und `camP`).

* **Runde 1 (24 Stück)**, damals mit dem kleinen Baukasten: überwiegend
  Spiralen, Tunnel, Droste und Kaleidoskope, z. B. ChainSpiralKaleido,
  ChainTunnelHex, ChainDrosteKaleido, ChainMobiusKaleido, ChainSinFold.
  14 davon fliegen in eine Öffnung.
* **01.10. (12 Stück)** ohne Öffnung: Gitter, Quasikristalle und Tapeten,
  gebogen von Strömungen und Wellen: ChainCurlFarris, ChainWarpQuasi,
  ChainTaylorHex, ChainGerstnerJacobi, ChainBillowPenrose,
  ChainConvectionSierpinski, ChainGyreSquareWave, ChainTriangleStreet,
  ChainWeierstrassWarp, ChainInterferenceKoch, ChainCurlAmmann,
  ChainSquareChirikov.
* **3D (5 Stück)**: Chain3DKifsTetra, Chain3DMandelbox, Chain3DOctaGyroid,
  Chain3DPolarTunnelBoxes, Chain3DTwistTorus.

---

## 12. Die beiden Presets

| | **Kettenlabor** | **Transformationen** |
|---|---|---|
| Szenen | nur die 3 Labore (2D, Tunnel, 3D) | 44: die 3 Labore + 36 benannte 2D-Ketten + 5 benannte 3D-Ketten |
| Wandern | immer (`morphP` 0,5–1) | Labore immer; benannte Ketten wandern nicht |
| FX | nur FxPlain (keine Nachbearbeitung) | FxPlain und FxChain |
| Gewichte | gleich | die 16 Szenen mit Öffnung auf 0,4 (ca. 19 % der Zeit) |
| Fotowechsel | alle 10–30 min (Blende 15–30 s) | alle 1,5–5 min (Blende 6–12 s) |
| Laufzeit eines Labors | 10–30 min | 3–8 min (benannte Ketten: 20–90 s) |
| Gedacht als | ein Generator, der stundenlang läuft | Querschnitt durch alle Transformationen |

---

## 13. Was gespeichert ist und was neu entsteht

* **Neu bei jedem Start**: Die App würfelt alle Knöpfe neu: A–D, Reihenfolge,
  Look, Palette, `morphP`, im 3D-Labor Raum/Kern/Körper/Kamera. Beim Wandern
  wählt sie live neue Klassen. Es gibt keine vorab gespeicherten Würfe.
* **Fest**: Der Shader-Code der Labore wird beim Entwickeln mit Python erzeugt
  (`Tools/scenegen`). Auf dem Zielrechner wird nichts generiert, und Python ist
  dort nicht nötig. Die Klassenlisten sind also ein fester Vorrat; das Labor
  kombiniert aus ihm, erfindet aber keine neuen Transformationen.
* **Merken (optional)**: Die Taste `f` (oder das Herz der Fernbedienung)
  schreibt den aktuellen Wurf nach `liked_rolls.tsv`.
  `Tools/scenegen/promote_likes.py` friert solche Würfe zu eigenen Szenen
  `ChainLike…` ein. Derzeit gibt es **keine** gemerkten Würfe und keine
  ChainLike-Szenen.

---

## 14. Bekannte Schwächen und offene Punkte

* ~~Szenendauer 20–90 s~~ – behoben 01.10.: Labore laufen 10–30 min
  (Kettenlabor) bzw. 3–8 min (Transformationen). Der Musik-Tempofaktor des
  Planers verkürzt ein wanderndes Labor nicht mehr.
* **Einstufiges Wandern** (`morphP` 0,15–0,5, nur in Genre-Presets): Dort wählt
  der Shader selbst und kennt die Öffnungs-Regel nicht.
* ~~Energie-Ordnung ist Handarbeit~~ – seit 02.10. gemessen (Abschnitt 4); die
  Welt-Stufen des 3D-Labors (Raum, Kern, Körper) sind weiter von Hand geordnet.
* **3D-Leistung**: Seit 01.10. rechnet die App das 3D-Labor in Durchgängen
  (Geometrie einmal in einen G-Buffer, die Farbketten darauf, s.
  `docs/leistung-2026-10-01.md`): 117–121 fps beim Wandern, GPU 4–5 ms. Jede
  *neue* Weltkombination kostet in der laufenden Sitzung einmal 25–35 ms
  (Treiber erzeugt den GPU-Code beim ersten Draw), ab der nächsten Sitzung
  nichts mehr. Chain3DMandelbox (benannte Kette, Uber-Shader) liegt weiter
  bei rund 54 fps.
* Die Taste `v` zeigt den Kamerablick der 3D-Labore noch nicht an.

---

## 15. Wo im Code

| Was | Datei |
|---|---|
| Klassenlisten, Öffnungen, Teilmengen | `Tools/scenegen/chain_classes.py` |
| Bibliothek aller Transformationen | `Tools/scenegen/gen.py` (`CHAIN_LIB`, `CHAIN3D_LIB`) |
| Laborquellen | `Tools/scenegen/src/ChainLab2D.glsl`, `make_chainlab3d.py`, `make_chainlabtunnel.py`, `make_fxchain.py` |
| benannte Ketten | `Tools/scenegen/make_chains.py`, `make_chains3d.py` |
| Wandern, Öffnungs-Regel, Kamera | `Source/EffectShader.cpp` (`stepChainWalk`, `resetChainWalk`, `stepChainCam`) |
| Durchgänge (ein Shader je Transformation), 3D-G-Buffer | `Tools/scenegen/make_chainpass.py` → `Engine/ChainPass/`; `EffectShader.cpp` (`runChainPasses`, `runChain3D`, `geomProgram`) |
| Programme im Helferprozess, Binär-Cache | `Source/ShaderForge.{h,cpp}`, `Source/ShaderForgeMain.{h,cpp}` |
| Messlauf über alle Labore | `Tools/perf_labs.py` (`--wav` für Musik) |
| Presets | `Tools/make_genre_configs.py` → `Presets/Kettenlabor.xml`, `Presets/Transformationen.xml` |
