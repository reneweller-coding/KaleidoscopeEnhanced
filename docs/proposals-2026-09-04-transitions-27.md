# 27 neue Übergänge — Vorschlagsliste, 04.09.2026

Bestand: 83 Übergänge in `Transitions/`. Keiner der folgenden doppelt einen
davon; die nächstliegende Nachbarschaft ist jeweils genannt.

Schnittstelle: Fragmentshader über die volle Fläche, `tex0` = abgehende Szene,
`tex1` = ankommende, `interpolation` läuft von 1 nach 0, dazu die Audio-Uniforms
und zwei bis drei `*P`-Parameter für Abwechslung pro Aktivierung.

Regeln, die auch hier gelten: jede Bewegung stetig (Regel V7c), Ereignisse nur
auf Licht und Farbe, nie auf Geometrie (V7d), Partikel rund und weichkantig
(V8e). Ein Übergang hat dabei einen eingebauten Vorteil: sein Fortschritt ist
monoton, also ist Stetigkeit geschenkt, solange keine Audio-Größe eine bereits
laufende Größe skaliert.

---

## A. Druck und Papier (6)

**1. PageTurnFolio** — Eine Seite hebt sich, rollt sich auf einem Zylinder ein
und gibt die ankommende Szene dahinter frei. Das Papier ist durchscheinend: im
Streiflicht schimmert das Rückseitenbild seitenverkehrt durch. Der Rollradius
schrumpft über den Fortschritt, die Rollachse steht schräg.
*Technik:* echte Zylinderabwicklung, kein aufgemalter Faltschatten.
*Audio:* audioSwell → Papiersteifigkeit (Radius), audioHigh → Kantenglanz.
*Falle:* die Rückseite muss an der Rollkante exakt anschließen, sonst reißt das Bild.

**2. RisographDrumOffset** — Die abgehende Szene zerfällt in zwei
Schmuckfarben-Trommeln, die um wenige Pixel auseinanderdriften; die ankommende
Szene wird als neuer Trommelsatz darübergedruckt. Fehlregister als Farbsaum,
Papierfaser als Rauschen, an den Rändern der Druckform ein Farbwulst.
*Audio:* audioFlux → Registerversatz, audioChromaHue → Wahl der zwei Sonderfarben.
*Nachbarschaft:* Chromatic trennt RGB; hier sind es zwei fette Sonderfarben mit Papierandruck.

**3. CyanotypeSunPrint** — Die ankommende Szene belichtet sich als Blaudruck aus:
Preußischblau steigt aus blassem Gelbgrün auf, in der Reihenfolge der Helligkeit,
danach spült ein Wasserrand die unbelichteten Stellen weg.
*Audio:* audioSwell → Belichtungsstärke, audioMid → Papierwölbung im Nassbereich.
*Falle:* der Farbweg muss über Gelbgrün laufen, sonst wirkt es wie eine Blautönung.

**4. PolaroidDevelopSquare** — Milchige Emulsion klart von den Rändern nach innen
auf, die Farbstoffe kommen in ihrer echten Reihenfolge an (Gelb, Magenta, Cyan),
der weiße Rahmenrand bleibt stehen und die untere Lasche ist breiter.
*Audio:* audioSwell → Entwicklungstempo, audioValence → Farbstich der frühen Phase.

**5. LetterpressImpression** — Die ankommende Szene ist eine Druckform, die in die
abgehende gepresst wird: geprägter Rand mit Biss-Schatten, Farbe quillt an jeder
Konturkante zu einem dunkleren Wulst, das Papier gibt in der Fläche nach.
*Audio:* audioKick → Anpressdruck als Licht, nie als Verschiebung. audioHigh → Papierkorn.

**6. ScratchboardReveal** — Schwarzer Grund wird in Schraffurstrichen weggekratzt.
Die Strichrichtung folgt dem Gradienten der ankommenden Szene, die Strichdichte
ihrer Helligkeit, sodass das Bild als Kratzzeichnung entsteht.
*Audio:* audioAdvance → Strichfortschritt, audioBass → Strichbreite.

## B. Optik und Licht (4)

**7. TalbotCarpetRevival** — Ein Gitter bildet sich im Nahfeld selbst ab: die
abgehende Szene zerfällt in einen periodischen Interferenzteppich mit den
typischen fraktalen Zweigen, und im Talbot-Abstand setzt sich die ankommende
Szene daraus wieder zusammen.
*Audio:* audioCentroid → Gitterperiode, audioSwell → Ausbreitungsabstand.
*Nachbarschaft:* NewtonRingsInterference ist radial; das hier ist periodisch und zweigt fraktal auf.

**8. SchlierenKnifeEdge** — Ein Messerschneide-Aufbau macht Dichtegradienten
sichtbar. Die Differenz beider Bilder wird als Brechungsfeld gelesen; die
Schneide fährt durch und kippt das Feld von hell nach dunkel.
*Audio:* audioFlux → Gradientenverstärkung, audioMid → Schneidenwinkel.

**9. LaserSpeckleDecorrelation** — Ein kohärentes Speckle-Feld liegt über der
abgehenden Szene und dekorreliert; die Körner wandern, zerfallen und
korrelieren auf der ankommenden neu. Dazwischen ist das Bild reines Rauschen
mit der richtigen Korngröße.
*Audio:* audioHigh → Korngröße, audioSwell → Dekorrelationstempo.
*Falle:* Speckle ist multiplikativ, nicht additiv — sonst sieht es aus wie Fernsehschnee.

**10. ZonePlateFocusPull** — Eine Fresnelsche Zonenplatte zieht sich nach innen
zusammen. Die abgehende Szene wird in ihre Ringe zerlegt und unscharf, die
ankommende aus denselben Ringen scharf gezogen.
*Audio:* audioSubBass → Brennweite, audioHigh → Ringkontrast.

## C. Materie und Phasenübergänge (6)

**11. SpinodalDecomposition** — Beide Bilder entmischen sich wie eine Legierung
unter der Mischungslücke: ein labyrinthisches Doppelnetz, das über den
Fortschritt vergröbert, ein Bild je Phase. Am Ende hat eine Phase gewonnen.
*Audio:* audioBass → Vergröberungsrate, audioValence → Phasenanteil.
*Nachbarschaft:* ReactionDiffusionTuring macht Flecken; Spinodale macht Bänder, die wachsen.

**12. MartensiticTwinBands** — Eine Scherumwandlung läuft durch: linsenförmige
Zwillingsbänder keimen und wachsen, jedes trägt die ankommende Szene geschert.
Die Bänder kreuzen sich in zwei festen Richtungen.
*Audio:* audioKick → Helligkeit neuer Keime (nicht ihre Zahl), audioSwell → Wachstumsrate.
*Falle:* Keimzahl einmal pro Aktivierung festlegen, nie pro Frame (Regel V7c).

**13. DewettingFilmRupture** — Die abgehende Szene ist ein dünner Film, der
reißt: Löcher keimen, ihre Ränder wulsten sich auf, die Stege werden dünn und
zerfallen zu Tropfen. Darunter liegt die ankommende Szene als Substrat.
*Audio:* audioFlux → Keimrate, audioHigh → Randwulst-Glanz.

**14. LeidenfrostSkitter** — Tropfen der abgehenden Szene schweben auf ihrem
eigenen Dampfpolster über einer heißen Platte, zittern und gleiten davon; unter
jedem Tropfen verzerrt das Polster die ankommende Szene wie eine Linse.
*Audio:* audioSubBass → Plattentemperatur (Polsterdicke), audioMid → Gleitrichtung.

**15. RecrystallisationGrainGrowth** — Glühen: spannungsfreie Körner der
ankommenden Szene keimen an den Korngrenzen und fressen die verformten Körner
der abgehenden. Die Grenzen wandern nach Krümmung, große Körner gewinnen.
*Audio:* audioSwell → Temperatur, audioChroma → Kornorientierung als Farbton.
*Nachbarschaft:* VoronoiShatter zerbricht ein festes Muster; hier wandern die Grenzen.

**16. CavitationBubbleCollapse** — Blasen wachsen in der abgehenden Szene und
kollabieren; jeder Kollaps stanzt einen Fleck der ankommenden Szene frei und
schickt einen Stoßring hinterher, der die Nachbarblasen anregt.
*Audio:* audioKick → Ringhelligkeit, audioBass → Blasenwachstumsrate.

## D. Lebendiges (4)

**17. CephalopodChromatophores** — Tausende Pigmentsäckchen dehnen und ziehen
sich zusammen. Jedes ist ein runder, weichkantiger Punkt, dessen Farbe aus der
ankommenden Szene kommt; das Bild setzt sich zusammen, wie sich Tintenfischhaut
umfärbt, mit Wellen, die über die Fläche laufen.
*Audio:* audioMid → Wellenlänge der Muskelwelle, audioSwell → Ausdehnungsgrad.

**18. LeafVeinPerfusion** — Farbstoff tritt am Blattstiel ein und durchströmt ein
Adernetz. Die ankommende Szene erscheint nur dort, wo das Netz sie schon
erreicht hat; die Adern verzweigen nach Murrays Gesetz, sodass die Dicken stimmen.
*Audio:* audioBass → Druck am Stiel, audioHigh → Glanz der gefüllten Adern.

**19. MurmurationHandoff** — Ein Starenschwarm hebt sich von der abgehenden Szene
ab und setzt sich als ankommende. Nicht die Position eines Vogels trägt das
Bild, sondern die Dichte des Schwarms — dadurch bleibt die Bewegung weich.
*Audio:* audioSwell → Schwarmkohäsion, audioHigh → Flügelblitzen.
*Falle:* runde, gejitterte Punkte (V8e), keine leuchtenden Gitterzellen.

**20. LichenColonisation** — Krustenflechten breiten sich radial von Sporen aus,
jede mit gelapptem Rand und konzentrischen Wachstumszonen. Wo zwei Thalli sich
berühren, bildet sich eine dunkle Grenzlinie, bis die Fläche gekachelt ist.
*Audio:* audioSwell → Wachstumsrate, audioValence → Flechtenfarbe (grau bis schwefelgelb).

## E. Mechanik und Gerät (3)

**21. SplitFlapDeparture** — Eine Fallblattanzeige: jede Zelle blättert durch
Zwischenbilder bis zur ankommenden Szene. Die Zeilen haben eigene Raten, laufen
also gegeneinander, und ein Blatt dreht immer stetig durch — es rastet nie.
*Audio:* audioAdvance → Blätterrate, audioKick → Anzeigelicht.
*Falle:* genau das Rasten wäre der Regelbruch; die Rate bleibt konstant, nur das Ziel wandert.

**22. TapeHeadCrossfade** — Eine Klebestelle läuft über den Tonkopf: die
Schnittdiagonale wandert durch, Gleichlaufschwankung biegt das Bild leicht,
und beim Durchlauf gibt es einen Kopfschlag als Helligkeitsstoß.
*Audio:* audioSubBass → Gleichlaufschwankung, audioFlux → Bandrauschen.

**23. LenticularTilt** — Zwei ineinandergeschobene Streifensätze unter einem
Linsenraster. Der Betrachtungswinkel schwenkt, die Bilder tauschen die Plätze,
und am Umschlagpunkt steht kurz das typische Streifen-Geisterbild.
*Audio:* audioMid → Schwenkrate, audioHigh → Linsenglanz.
*Nachbarschaft:* Blinds schiebt Lamellen; hier bleibt alles stehen und nur der Winkel ändert sich.

## F. Verfahren und Algorithmen (4)

**24. DiffusionDenoiseReveal** — Die ankommende Szene taucht so aus dem Rauschen
auf, wie ein Diffusionsmodell abtastet: der Rauschpegel fällt, grobe Strukturen
kommen zuerst, Feinheiten zuletzt, und zwischendurch stehen kurz plausible, aber
falsche Formen im Bild.
*Audio:* audioSwell → Abtastschritte, audioHigh → Restrauschen.

**25. HilbertCurveSweep** — Eine raumfüllende Kurve fährt die Fläche in
Hilbert-Ordnung ab und zieht die Grenze zwischen den Bildern mit sich. Die
Wischkante ist dadurch fraktal statt gerade und springt trotzdem nie.
*Audio:* audioAdvance → Fahrtempo, audioCentroid → Kurvenordnung (Feinheit).

**26. WaveFunctionCollapseTiles** — Kacheln fallen aus der Überlagerung vieler
Kandidaten (als Unschärfe sichtbar) auf eine bestimmte Kachel der ankommenden
Szene, und zwar nur passend zu ihren Nachbarn. Die Festlegung breitet sich von
wenigen Keimen aus.
*Audio:* audioFlux → Kollapsrate, audioBass → Kachelgröße.

**27. SeamCarvingRetarget** — Nähte geringster Energie werden aus der abgehenden
Szene entfernt und Nähte der ankommenden eingefügt. Das Bild wird ungleichmäßig
zusammengeschoben: ruhige Flächen verschwinden zuerst, Kanten halten sich.
*Audio:* audioFlux → Nahtrate, audioMid → Energiemaß (Kanten gegen Farbe).
