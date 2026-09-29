# 325 Szenen nach den Ursprungs-Kriterien (30.09.2026)

Ersetzt als Arbeitsliste die beiden Listen vom selben Tag
(`proposals-2026-09-30-abstrakt.md`, `proposals-2026-09-30-texturen.md`):
deren Ideen sind hier gegen die Kriterien geprüft, umgebaut oder gestrichen
und durch neue ergänzt.

## Die Kriterien

Maßstab sind die Szenen, mit denen alles anfing: **Kaleidoscope, Tunnel,
TunnelPlain, TunnelReverse** (Schauwert jetzt 9). Was sie auszeichnet:

1. **Bildschirmfüllend und endlos.** Das Bild ist ein Feld, das für jeden
   Punkt der Ebene definiert ist und über den Bildrand hinaus weiterläuft —
   kein gerahmtes Motiv, kein Horizont, kein Boden, kein Objekt vor Grund.
2. **Spiegelbar.** Die Engine faltet Samples außerhalb des Bildes gespiegelt
   zurück (Rig2D beim Herauszoomen) und zeigt die Szene in Kachel-Übergängen
   verkleinert vielfach. Das Bild muss gespiegelt und gekachelt ein stimmiges
   Muster ergeben: keine Schwerkraftrichtung, kein oben/unten, keine Schrift.
3. **Stetige, komplexe Bewegung des ganzen Bildes** — nicht ein ruhiges Bild,
   in dem eine Lampe auf die Musik reagiert.
4. **Viele Stellschrauben.** Mehrere Drehknöpfe, die den Charakter wirklich
   ändern (Zähligkeit, Tiefe, Dichte, Tempo, Form), und Musik, die in die
   **Struktur** greift, nicht nur ins Licht — wie bei den Originalen:
   Tonart → Form, Harmoniewechsel → Atemzug, Rauheit → Welligkeit,
   Spektralbreite → Tiefe, Rolloff → Farbtemperatur, integrierte Phasen
   (`audioPhase`, `audioAdvance`) → Bewegung.
5. **Aus dem Texturen-Pool gespeist.** Szenen, die ihr Bild selbst erfinden,
   wiederholen sich schnell (TheCore u. a.: stark, aber nach dem dritten Mal
   bekannt). Wo die Textur Wand, Feld, Licht, Stoff oder Farbe liefert, ist
   jede Aktivierung mit jedem der 977 Fotos ein anderes Bild.
6. Weiter gilt: kein Bogen (`sceneProgress`), runde Partikel, alles stetig,
   **keine Erschütterung** — Kamera, globaler Zoom und globale Drehung nur
   über langsame oder integrierte Signale, schnelle Hüllkurven nur in Licht,
   Farbe und Dingen innerhalb des Bildes.

**Die Kriterien sind eine Leitlinie, kein Filter.** Sie werden unscharf
angewendet: Eine Szene darf eines verfehlen, wenn sie es anders aufwiegt, und
Ausnahmen bestätigen die Regel, wo sie Sinn ergeben. Das gilt besonders für
Punkt 4 — nicht jede Szene braucht jede Kopplung, sondern genug, dass die
Musik im Bild sichtbar arbeitet. Und Schwerkraft ist kein Ausschluss: Wachs,
Honig, Tropfen, Lavalampe und Ölprojektor gehören zu den faszinierendsten
Effekten überhaupt; sie müssen nur an die echten Vorbilder heranreichen
(Familie 13).

**Schauwert:** 0–10, die Originale = 9. Die Klammern sind Schätzungen vor dem
Bau; 10 vergebe ich keiner Idee im Voraus.

## Was das für das Bisherige heißt

- **Die 53 konkreten Szenen seit v1.17.0** erfüllen Kriterium 1 und 2 meist
  nicht (Horizont, Boden, gerahmtes Motiv) und reagieren fast nur im Licht.
  Sie bleiben im Katalog, werden aber **dezent eingesetzt** (geringere
  Häufigkeit, Neubewertung nach dem App-Check). Die restlichen 43 konkreten
  Vorschläge vom 29.09. werden nicht mehr gebaut.
- **Zurückgestellt** aus den beiden Listen vom 30.09.: Landschaften mit
  Horizont (Canyon-, Dünen-, Schelfeisflug, schwebende Inseln), gerahmte
  Innenräume (Säulenhalle, Galerie, Atrium, Pavillon), Einzelobjekte vor
  Grund (Monolith, Brillant, Mobile, Kissen), Op-Art-Täuschungen,
  Fotoprozesse, Datenkarten mit Globus. Nicht verboten — nur nicht vorn in
  der Reihe. Schwerkraft-Effekte sind zurück, in Familie 13.
- **Umgebaut:** Material-Makros sind keine nachgebauten Steine mehr, sondern
  optische Effekte **über** der Textur (Schiller über jedem Foto statt eines
  nachgebauten Labradorits); Landschaften werden zu Aufsichten; Räume werden
  zu Schächten, Tunneln oder Volumen ohne Horizont.

**Bausteine**, die viele Ideen teilen: Höhe und Normale aus der Luma
(`textureLod` grob + fein), Kantenbild (Gradientenbetrag), Segmente
(Voronoi-Zellen mit Textur-Mittelwert), Strömungsfeld (Gradient und seine
Senkrechte), Paar (tex0 und tex1 in zwei Rollen), polare Faltung mit
Superellipse wie in den Originalen, Spiegel-Falz für Endlosigkeit.

**Womit ich anfangen würde:** TextureBoreTunnel, TextureMaelstrom,
WallpaperGroupCycle, TextureMirrorSeamsWander, TextureFlowParticles,
TextureSequinField, TextureNeonTrace, TextureLavaCracks, TextureAuroraField,
TextureNebulaVolume, TextureCloudInterior, RichterSqueegee,
SchillerOverTexture, ActiveNematicDefects, DewdropLensArray, OilProjector
(Neubau), LavaLamp (Neubau), RheoscopicSwirl.

---

## 1. Polar und Sog — Verwandte der Tunnel (25)

*Endlos:* radial vom Zentrum in die Tiefe, nach außen offen; spiegelbar wie
Tunnel. *Knöpfe:* Zähligkeit der Wand, Kehltiefe, Vorlauf-Tempo, Querschnitt
(Superellipse), Drehung. *Musik in der Struktur:* Spektralbreite → Kehltiefe,
Rauheit → Wandwelligkeit, Tonart → Querschnitt, Harmoniewechsel → Atemzug,
`audioAdvance` → Vorlauf, Rolloff → Farbtemperatur.

1. **TextureBoreTunnel** (9) [T: Wand] -- ein Bohrloch, dessen Wand die Textur als Relief trägt; Rillen und Grate im Streiflicht einer mitfahrenden Lampe, weit hinten glüht der Ausgang.
2. **TwinHelixTunnel** (9) [T: Wand] -- zwei gegenläufig gewundene Texturbänder bilden die Wand, in den Spalten dazwischen leuchtet es.
3. **TextureMaelstrom** (9) [T: Wand] -- ein Strudel, dessen Wände aus der Textur bestehen, Schaumlinien spiralen in die Tiefe.
4. **TextureLatticeTunnel** (8) [T: Wand] -- ein Käfig aus Gitterstäben vor der Texturwand, Parallaxe zwischen Gitter und Wand.
5. **TextureSquareShaft** (8) [T: Platten] -- ein quadratischer Schacht, die Wandplatten sind Texturstücke, die Fugen glühen.
6. **NeonRingTunnel** (9) [T: Kanten] -- Ringe aus Neonröhren, gezogen aus den Kanten der Textur, fliegen vorbei.
7. **TextureIrisShutter** (8) [T: Lamellen] -- Irisblenden aus Texturlamellen, in die Tiefe gestaffelt, öffnen und schließen sich stetig.
8. **CrystalThroatTunnel** (8) [T: Innenfarbe] -- eine facettierte Kristallwand, die Textur als Farbe im Inneren, Glanzkanten blitzen.
9. **WaterfallTunnel** (8) [T: gebrochen] -- Wände aus fallendem Wasser, dahinter die Textur gebrochen und verzerrt.
10. **TextureBurrow** (8) [T: Wand] -- eine organische Röhre, deren Wand langsam peristaltisch wogt.
11. **StarStreakTunnel** (8) [T: Lichtpunkte] -- die hellen Pixel der Textur werden Lichtstriche, die an der Kamera vorbeiziehen.
12. **TextureLanternTunnel** (9) [T: Segmente] -- die Tunnelwand aus Lampions, jeder ein Texturstück, von innen erleuchtet.
13. **SpiralStairWell** (8) [T: Stufen] -- der Blick einen endlosen Wendeltreppenschacht hinab, Stufen aus Textur, Licht von unten.
14. **TextureVortexCloud** (8) [T: Wolken] -- ein Wolkentrichter von innen, die Wolken aus der Textur.
15. **TextureCoilSpring** (8) [T: Bänder] -- die Wand als gewickelte Texturbänder mit Lichtspalten.
16. **TextureForkingTunnel** (8) [T: Wand] -- der Tunnel verzweigt sich stetig, Gabelung folgt auf Gabelung.
17. **PolarRippleTunnel** (8) [T: Wand] -- radiale Wellen laufen die Texturwand hinab.
18. **TextureTubeBundle** (8) [T: Tunnel je Zelle] -- ein Wabenbündel von Röhren, jede zeigt ihren eigenen Tunnel mit anderem Texturausschnitt.
19. **TextureGeodeInterior** (9) [T: Kristallfarbe] -- das Innere einer Geode, Kristallspitzen weisen radial nach innen, das Licht wandert.
20. **TextureFlowerThroat** (8) [T: Adern] -- ein Blütenkelch als Tunnel, die Blütenblätter mit Texturadern, durchscheinend.
21. **TextureRibbonVortex** (8) [T: Bänder] -- Bänder aus Textur spiralen in die Tiefe.
22. **TextureAccretionStreams** (9) [T: Strom] -- ringförmige glühende Ströme aus Textur kreisen um ein Zentrum.
23. **TextureTelescopeRings** (8) [T: Ringe] -- verschachtelte Ringe drehen gegeneinander, jeder zeigt eine andere Stelle der Textur.
24. **StandingWaveTunnel** (8) [T: Wand] -- die Wand aus stehenden Wellen, deren Muster Rauheit und Harmonie folgen.
25. **VaultShaftUp** (8) [T: Rippenfelder] -- der Blick in ein endloses Gewölbe nach oben, Rippen radial, die Felder aus Textur.

## 2. Faltungen und Symmetrien — Verwandte des Kaleidoskops (25)

*Endlos:* periodische oder radiale Faltungen; spiegelbar per Konstruktion.
*Knöpfe:* Symmetriegruppe bzw. Zähligkeit, Zellgröße, Nahtform, Drehung,
Ausschnitt in der Textur. *Musik in der Struktur:* Tonart → Nahtform
(gerade/gewölbt), Rauheit → Welligkeit der Spiegel, Harmoniewechsel →
Atemzug, `audioPhase` → Drehung, Swell → Zellgröße (langsam).

1. **WallpaperGroupCycle** (9) [T: Motiv] -- die Textur wandert stetig durch alle 17 Tapetengruppen, die Übergänge weich überblendet.
2. **TextureFriezeBands** (8) [T: Motiv] -- übereinandergelegte Friesbänder, jedes mit eigener Friesgruppe, laufen gegeneinander.
3. **CurvedMirrorKaleido** (9) [T: Motiv] -- ein Kaleidoskop mit gewölbten Spiegeln; ihre Krümmung atmet mit der Tonart, Rauheit lässt sie wellen.
4. **DoyleSpiralTexture** (8) [T: Kreise] -- eine Doyle-Spiralpackung, jeder Kreis ein gedrehter und skalierter Texturausschnitt.
5. **TextureTruchetMirror** (8) [T: Kacheln] -- Truchet-Kacheln aus gespiegelter Textur, Bögen ergeben fließende Bänder.
6. **TextureGirihChambers** (8) [T: Füllung] -- Girih-Sterne, jeder eine kleine Spiegelkammer mit Textur.
7. **TextureHexPrismWall** (8) [T: Facetten] -- eine Wand aus Hexprismen, jede Facette spiegelt die Textur anders.
8. **TextureOrbifoldFlow** (9) [T: Motiv] -- die Spiegelnähte einer Faltung bewegen sich selbst, die Textur fließt durch sie hindurch.
9. **TextureMirrorSeamsWander** (9) [T: Motiv] -- keine geraden Spiegel, sondern Kurven, die als Nähte über die Textur wandern.
10. **TextureConformalMorph** (8) [T: Motiv] -- konforme Abbildungen (z², exp, Joukowski) morphen stetig ineinander.
11. **TextureCelticKnotwork** (8) [T: Bänder] -- ein Flechtwerk aus Texturbändern, über und unter.
12. **TextureRingGears** (8) [T: Ringe] -- Ringe unterschiedlicher Zähligkeit greifen wie Zahnräder ineinander.
13. **TextureGlideReflection** (8) [T: Motiv] -- Gleitspiegelungen: die Textur läuft in Reihen wie Escher-Schuppen.
14. **TextureSphericalTiling** (8) [T: Motiv] -- eine Ikosaeder-Kachelung, stereografisch auf die Ebene projiziert, dreht langsam.
15. **TexturePinwheelTiling** (8) [T: Füllung] -- die Pinwheel-Kachelung mit ihren unendlich vielen Richtungen, gefüllt mit Textur.
16. **TextureTumblingBlocks** (8) [T: Würfelseiten] -- isometrische Würfel mit Textur auf drei Seiten, Kippfigur.
17. **TextureOpWaves** (8) [T: Streifen] -- Riley-Wellen aus Texturstreifen.
18. **SymmetryBreathing** (9) [T: Motiv] -- die Symmetrie wächst und schwindet stetig, von einfach bis zwölfzählig.
19. **TexturePetalFold** (8) [T: Blätter] -- eine Faltung zu durchscheinenden Blütenblättern, die überlappen.
20. **TextureP6Crystal** (8) [T: Motiv] -- eine hexagonale Punktgruppe, Kanten mit Kristallglanz.
21. **TextureWeaveSymmetry** (8) [T: Fäden] -- Gewebesymmetrien (Satin, Köper) aus Texturfäden.
22. **TextureFanFold** (8) [T: Falten] -- eine Leporello-Fächerfaltung, Licht in den Falten.
23. **TexturePineConeSpirals** (8) [T: Schuppen] -- Schuppen in Fibonacci-Parastichen, jede ein Stück Textur.
24. **DoubleMirrorWave** (9) [T: Motiv] -- zwei gewellte Spiegel stehen einander gegenüber, eine unendliche Kette von Spiegelungen.
25. **TextureInfiniteRosettes** (8) [T: Motiv] -- ein Feld von Rosetten verschiedener Zähligkeit, die ineinander übergehen.

## 3. Texturfelder in Bewegung (25)

*Endlos:* Aufsicht auf eine Fläche, die sich nach allen Seiten fortsetzt.
*Knöpfe:* Maßstab, Strömungsstärke, Relieftiefe, Lichtrichtung, Dichte.
*Musik in der Struktur:* Rauheit → Turbulenz, Spektralbreite → Relieftiefe,
Tonart → Strömungsform, Harmoniewechsel → Welle, `audioAdvance` → Fluss.

1. **TextureFlowParticles** (9) [T: Feld + Farbe] -- Millionen Teilchen folgen dem Gradientenfeld und tragen die Farben der Textur.
2. **TextureAdvectionSilk** (8) [T: Stoff] -- die Textur wird von einer Curl-Strömung geschoben, zwei versetzte Phasen machen den Fluss endlos.
3. **TextureReliefRaking** (8) [T: Relief] -- die Textur als Relief, ein Streiflicht kreist darüber (vorher gegen VideoRelief abgrenzen).
4. **TextureHeightWaves** (8) [T: Grund] -- Wasser über der Textur, Wellen und Kaustik darauf.
5. **TextureMagneticField** (8) [T: Feld] -- Feldlinien aus dem Texturgradienten, Teilchen laufen auf ihnen.
6. **TextureContourNeonMap** (8) [T: Höhen] -- die Höhenlinien der Helligkeit als Neon, darunter glimmt die Textur.
7. **TextureLightningPaths** (9) [T: Risse] -- Blitze folgen den dunklen Rissen. Kick = Entladung (nur Licht).
8. **TextureGlowVines** (8) [T: Grate] -- leuchtende Ranken wachsen die hellen Grate entlang.
9. **TextureStreamlineWeave** (8) [T: Feld] -- die Stromlinien der Textur werden gewebte Fäden.
10. **TextureErosionFlow** (8) [T: Höhen] -- Erosionsrinnen graben sich in die Textur, Wasser glitzert darin.
11. **TextureSandRipples** (8) [T: Sand] -- die Textur als Sandfläche, Windrippel wandern.
12. **TextureRainTrickle** (8) [T: hinter Glas] -- Regentropfen laufen dem Gefälle der Textur nach über eine Scheibe.
13. **TextureTidePools** (8) [T: Grund] -- Wasser füllt die Täler der Textur, steigt und fällt, spiegelt.
14. **TextureFireFront** (8) [T: Brennstoff] -- eine Glutfront frisst sich durch die Textur, die hellen Stellen zuerst, und wächst wieder zu.
15. **TextureFrostCreep** (8) [T: Grund] -- Eis wächst von den dunklen Stellen aus über die Textur.
16. **TextureMoldBloom** (8) [T: Nährboden] -- leuchtender Pilzrasen wächst über die Textur.
17. **TextureIronFilings** (7) [T: Feld] -- Eisenspäne richten sich nach dem Gradienten aus.
18. **TextureFlipDisc** (8) [T: Bild] -- ein Feld runder Klappscheiben zeigt die Textur, Wellen kippen darüber.
19. **TextureSequinField** (9) [T: Bild] -- Pailletten zeigen die Textur, Wellen kippen sie und wechseln die Farbe.
20. **TexturePinArt** (8) [T: Relief] -- ein Nagelbrett, dessen Nadeln das Relief der Textur formen, Glanz auf den Köpfen.
21. **TextureMarbleFlow** (8) [T: Adern] -- die Textur wird zu Marmoradern, die langsam fließen.
22. **TextureCellMigration** (8) [T: Zellinhalt] -- Zellen tragen Texturstücke, wandern und teilen sich.
23. **TextureFireflyGathering** (8) [T: Helligkeit] -- Glühwürmchen sammeln sich an den hellen Stellen und ziehen weiter.
24. **TextureMurmurationShape** (8) [T: Helligkeit] -- ein Schwarm zeichnet die Helligkeit der Textur nach.
25. **TextureRippleInterference** (8) [T: Quellen] -- von den hellen Punkten laufen Wellen aus und interferieren, Kaustik darunter.

## 4. Licht und Glühen im Feld (25)

*Endlos:* Aufsicht oder Blick in einen Himmel ohne Horizont. *Knöpfe:*
Glühstärke, Halo, Dichte, Farbtemperatur, Tempo. *Musik in der Struktur:*
Rauheit → Flackerform (stetig), Tonart → Farbe, Spektralbreite → Halo,
schnelle Hüllkurven nur ins Licht.

1. **TextureNeonTrace** (9) [T: Kanten] -- die Kanten der Textur werden Neonröhren mit Halo, dazwischen die Textur, dunkel und nass.
2. **TextureLavaCracks** (9) [T: Risse] -- die dunklen Risse glühen wie Lava durch, die Kruste kühlt ab und bricht neu.
3. **TextureUVBlacklight** (8) [T: Farbe] -- die Textur als fluoreszierende Farbe unter Schwarzlicht.
4. **TextureEmberBed** (8) [T: Glut] -- die Textur als Glutbett, runde Funken steigen.
5. **TextureCircuitGlow** (8) [T: Kanten] -- die Kanten als Leiterbahnen, Lichtpulse laufen darauf.
6. **TextureGoboWash** (8) [T: Projektion] -- Gobos projizieren die Textur auf eine endlose Nebelwand.
7. **TextureStainedGlassField** (9) [T: Segmente] -- eine Fläche aus Bleiglaszellen, das Licht dahinter wandert.
8. **TextureLanternField** (9) [T: Schirme] -- der Blick nach oben in einen Himmel voller Laternen, in die Tiefe gestaffelt.
9. **TextureLightboxMosaic** (8) [T: Kacheln] -- ein Feld aus Leuchtkästen, jeder ein Texturstück.
10. **TextureFiberOptic** (8) [T: Farbe] -- die Aufsicht auf ein Feld glühender Faserspitzen.
11. **TextureElectroluminescent** (8) [T: Flächen] -- die Textur als Leuchtfolie, die Flächen leuchten in Bändern nacheinander auf.
12. **TextureGlowingIce** (8) [T: Eis] -- die Textur als Eis, blau durchleuchtet, die Risse glühen.
13. **TextureBioluminescentField** (8) [T: Auslöser] -- ein Meer von oben, das Leuchten folgt der Textur.
14. **TextureLEDDots** (8) [T: Bild] -- ein Feld runder LED-Punkte zeigt die Textur, Halo und Dunst.
15. **TextureLaserGrid** (8) [T: Konturen] -- Laserlinien zeichnen die Konturen in Dunst.
16. **TexturePhosphorTrails** (8) [T: Lichtpunkte] -- Lichtpunkte schreiben Spuren, die nachglühen.
17. **TextureAuroraField** (9) [T: Farbe] -- Polarlicht von unten gesehen, Vorhänge in den Farben der Textur.
18. **TextureFloatingLights** (8) [T: Farbe] -- ein Feld schwimmender Lichter auf dunklem Wasser, von oben.
19. **TextureHeatGlowMetal** (8) [T: Metall] -- die Textur als Metall, das glüht; Wärme wandert, Anlauffarben folgen.
20. **TextureNeonCalligraphy** (8) [T: Farbe] -- leuchtende Pinselzüge fließen über das Feld.
21. **TextureFluorescentVeins** (8) [T: Adern] -- die Adern der Textur fluoreszieren nacheinander.
22. **TextureCometShower** (8) [T: Farbe] -- Meteore in Texturfarben ziehen Leuchtspuren über einen Himmel ohne Horizont.
23. **TextureNeonRain** (8) [T: Farbe] -- der Blick nach oben in Regen, die Tropfen leuchten in Texturfarben.
24. **TextureSpotlightSweep** (8) [T: Fläche] -- Scheinwerferkegel streichen über das Texturfeld.
25. **TextureBokehStreams** (8) [T: Farbe] -- Ströme von Bokeh-Scheiben in Texturfarben.

## 5. Volumenflüge ohne Horizont (25)

*Endlos:* Flug durch ein Medium, das in alle Richtungen weitergeht.
*Knöpfe:* Dichte, Schichtzahl, Tempo, Lichtrichtung, Farbsättigung.
*Musik in der Struktur:* Spektralbreite → Tiefe, Rauheit → Turbulenz,
Tonart → Lichtfarbe, `audioAdvance` → Vorlauf.

1. **TextureNebulaVolume** (9) [T: Dichte + Farbe] -- die Textur in Schichten gestapelt als Nebel, Flug hindurch, Sterne dahinter.
2. **TextureCloudInterior** (9) [T: Dichte] -- Flug durch Wolken von innen, Sonnenlicht bricht durch Lücken.
3. **TextureSmokeChamber** (8) [T: Farbe] -- Rauch in Texturfarben wirbelt durch Lichtkegel.
4. **TextureAuroraVolume** (8) [T: Farbe] -- Polarlichtvorhänge, in der Tiefe gestaffelt.
5. **TextureUnderwaterHaze** (8) [T: Trübung] -- Tauchen durch Wasser ohne Grund, Schwebeteilchen, Licht von oben.
6. **TextureGasGiantDive** (8) [T: Bänder] -- in die Wolkenbänder eines Gasriesen hinein.
7. **TextureGalaxyFlight** (8) [T: Arme] -- Flug durch Spiralarme aus Textur.
8. **TextureStarsFromLight** (8) [T: Lichtpunkte] -- die hellen Stellen der Textur werden Sterne in der Tiefe.
9. **TextureSnowVolume** (8) [T: Farbe] -- runde Flocken in Texturfarben, gestaffelte Tiefe.
10. **TextureBubbleColumn** (8) [T: Brechung] -- aufsteigende Blasen, jede bricht die Textur dahinter.
11. **TextureSilkVeils** (8) [T: Stoff] -- Seidenschleier, in der Tiefe gestaffelt und durchleuchtet.
12. **TextureDustMotes** (8) [T: Licht] -- Staub schwebt in Lichtbahnen, das Licht gefärbt von der Textur.
13. **TextureInkClouds3D** (8) [T: Farbe] -- Tintenwolken im Raum.
14. **TexturePlanktonDrift** (8) [T: Farbe] -- Planktonteilchen in Texturfarben, gestaffelte Tiefe.
15. **TextureLightShafts** (8) [T: Licht] -- Lichtbahnen fallen durch Schichten aus Textur.
16. **TextureCrystalLatticeFlight** (8) [T: Kristallfarbe] -- Flug durch ein Kristallgitter.
17. **TextureShardCloud** (8) [T: Scherben] -- schwebende Texturscherben in der Tiefe, jede mit Glanzkante.
18. **TextureLeafStorm** (8) [T: Blätter] -- Plättchen aus Textur wirbeln.
19. **TextureChainCurtains** (8) [T: Perlen] -- Vorhänge aus Perlenketten in der Tiefe, jede Perle eine kleine Linse.
20. **TextureGlassCubeSwarm** (9) [T: Brechung] -- ein Schwarm Glaswürfel bricht die Textur.
21. **TextureRingFlight** (8) [T: Teilchen] -- Flug durch einen Planetenring aus Texturteilchen.
22. **TextureMistLights** (8) [T: Farbe] -- Lichter im Nebel, Bokeh in vielen Tiefen.
23. **TextureDewWebVolume** (8) [T: Tropfen] -- Spinnennetze in der Tiefe, jeder Tautropfen zeigt die Textur.
24. **TextureRibbonCloud** (8) [T: Bänder] -- schwebende Bänder aus Textur.
25. **TextureConfettiVolume** (7) [T: Farbe] -- runde Konfetti in Texturfarben in vielen Tiefen.

## 6. Malerei in Bewegung (25)

*Endlos:* ein Malgrund, der sich in alle Richtungen fortsetzt. *Knöpfe:*
Pinselgröße, Schichtzahl, Tempo, Kontrast, Richtung. *Musik in der
Struktur:* Rauheit → Strichunruhe, Tonart → Farbwahl, Harmoniewechsel →
neue Schicht, Spektralbreite → Pinselgröße. Die Farben liefert die Textur.

1. **RichterSqueegee** (9) [T: Schichten] -- Rakelzüge ziehen Farbschichten aus der Textur auseinander, darunter scheinen andere durch.
2. **PollockDripField** (8) [T: Farbe] -- Tropfspuren schichten sich zu einem dichten Geflecht, frische glänzen nass.
3. **LouisVeilPours** (8) [T: Farbe] -- transparente Farbschleier überlagern sich.
4. **FrankenthalerSoakStain** (8) [T: Farbe] -- verdünnte Farbe saugt sich in rohe Leinwand, die Ränder blühen.
5. **ZaoWouKiStorm** (8) [T: Farbe] -- Tusche- und Ölstürme um einen Lichtkern.
6. **StellaProtractors** (8) [T: Farbe] -- Winkelmesser-Bögen in Neon, als endloses Muster.
7. **KandinskyField** (8) [T: Farbe] -- Kreise, Dreiecke und Linien treiben in Kompositionsordnung.
8. **BoogieWoogieGrid** (8) [T: Farbe] -- ein endloses Mondrian-Raster, Lichtpakete fahren darauf.
9. **AfKlintSpirals** (8) [T: Farbe] -- große Spiralen und Blüten wachsen in Pastell.
10. **DelaunayDiscs** (8) [T: Farbe] -- Simultankreise drehen gegeneinander.
11. **KusamaDotInfinity** (8) [T: Farbe] -- Punktnetze in mehreren Schichten pulsieren.
12. **MatisseCutouts** (8) [T: Farbe] -- Scherenschnittformen treiben übereinander.
13. **MehretuLayers** (8) [T: Farbe] -- Architekturlinien, Farbflächen und Wirbelzeichen in vielen Schichten.
14. **KleinBlueSponge** (7) [T: Relief] -- Yves-Klein-Blau als Schwammrelief im Streiflicht.
15. **ImpastoRaking** (8) [T: Bild] -- die Textur als pastose Ölmalerei, die Grate glänzen im wandernden Licht.
16. **TurnerVortex** (9) [T: Farbe] -- ein Turner-Wirbel aus Licht, Dunst und Farbe.
17. **ImpressionistDabs** (8) [T: Bild] -- die Textur aus Pinseltupfern, die stetig neu gesetzt werden.
18. **PointillistDots** (8) [T: Bild] -- die Textur aus runden Farbpunkten, die atmen.
19. **SumiEnsoField** (7) [T: Tusche] -- Zen-Kreise entstehen und verblassen überall im Feld.
20. **KlineBlackStrokes** (7) [T: Grund] -- schwarze Balkenstriche über der Textur.
21. **HofmannPushPull** (8) [T: Farbe] -- Farbblöcke drücken und ziehen gegeneinander.
22. **MitchellStrokes** (8) [T: Farbe] -- dichte, energische Pinselzüge.
23. **SoulagesOutrenoir** (9) [T: Rillen] -- schwarzes Relief, dessen Rillen aus der Textur kommen; Licht spielt in den Furchen.
24. **HartungScratches** (7) [T: Grund] -- Kratzspuren und Liniengarben auf Farbgrund.
25. **TwomblyScribble** (7) [T: Grund] -- Kritzeln und Schlaufen auf der Textur.

## 7. Material und Schiller über der Textur (25)

*Endlos:* die Textur selbst als Fläche; die Szene legt einen optischen Effekt
darüber, der jedes Foto verwandelt. *Knöpfe:* Stärke, Maßstab, Lichtweg,
Farbverschiebung, Glanz. *Musik in der Struktur:* Tonart → Farbverschiebung,
Rauheit → Körnung, Spektralbreite → Glanzbreite; das Licht wandert stetig
auf einer eigenen Bahn, damit sich das ganze Bild bewegt.

1. **SchillerOverTexture** (9) [T: Grund] -- labradoreszenter Schiller huscht in Blau und Gold über jedes Foto.
2. **TextureNacreSheen** (8) [T: Grund] -- Perlmutt-Irisieren entlang der Strukturen der Textur.
3. **TextureOpalFire** (8) [T: Grund] -- Opalfeuer-Flecken flammen über der Textur auf.
4. **TextureChatoyance** (8) [T: Grund] -- ein seidiges Lichtband läuft wie ein Katzenauge über die Fasern.
5. **TextureAnodizeRainbow** (8) [T: Höhe] -- Anlauffarben nach der Höhe der Textur.
6. **TextureHoloFoil** (9) [T: Knitter] -- die Textur als holografische Folie, Regenbogenglanz springt mit dem Licht.
7. **TextureGoldLeafBurnish** (8) [T: Grund] -- Blattgold über der Textur, der Glanz wandert.
8. **TextureLacquerLayers** (8) [T: Schichten] -- Urushi-Lack in Schichten, stellenweise durchgeschliffen.
9. **TextureCrackleGlaze** (8) [T: Risse] -- Glasurrisse leuchten über der Textur.
10. **TextureWetGloss** (8) [T: Grund] -- die Textur wird nass, Glanzlichter wandern.
11. **TextureMetallicFlakes** (8) [T: Grund] -- Metallic-Flocken mit Farbwechsel liegen über der Textur.
12. **TextureVelvetPile** (7) [T: Grund] -- Samt-Glanz streicht in Wellen über die Textur.
13. **TextureBrushedMetal** (7) [T: Grund] -- die Textur als gebürstetes Metall, anisotroper Glanz.
14. **TextureCarvedJade** (8) [T: Grund] -- die Textur als durchscheinende Jade, Licht streut darunter.
15. **TexturePearlescent** (8) [T: Grund] -- Perlglanzlack über der Textur.
16. **TextureAmberSubsurface** (8) [T: Grund] -- die Textur durchleuchtet wie Bernstein.
17. **TextureIceGlaze** (8) [T: Grund] -- eine Eisglasur über der Textur, Blasen und Risse.
18. **TextureSilverTarnish** (7) [T: Grund] -- Anlauffarben auf Silber wandern.
19. **TexturePatinaBloom** (8) [T: Nährboden] -- Kupferpatina wächst aus den Vertiefungen.
20. **TextureDichroicCoat** (8) [T: Grund] -- eine dichroitische Beschichtung, die Farbe kippt mit dem Winkel.
21. **TextureMicaGlitter** (8) [T: Grund] -- Glimmerplättchen blitzen über der Textur.
22. **TextureThinFilmSoap** (8) [T: Grund] -- eine Seifenhaut-Interferenz strömt über der Textur.
23. **TextureOilSlickSheen** (8) [T: Grund] -- Ölfilm-Regenbögen auf nasser Textur.
24. **TextureMoonstoneGlow** (8) [T: Grund] -- ein bläulicher Mondsteinschein wandert unter der Oberfläche.
25. **TextureStarSapphire** (8) [T: Grund] -- Asterismus-Sterne wandern mit dem Licht über die Textur.

## 8. Pigment und Flüssigkeit (25)

*Endlos:* Aufsicht auf eine Fläche ohne Rand; keine Schwerkraftrichtung.
*Knöpfe:* Tropfengröße, Ausbreitung, Viskosität, Schichtzahl, Tempo.
*Musik in der Struktur:* Harmoniewechsel → neuer Tropfen (stetig
einblendend), Rauheit → Randunruhe, Spektralbreite → Ausbreitung. Die
Farben kommen aus der Textur.

1. **AlcoholInkBlooms** (9) [T: Farbe] -- Alkoholtinte blüht auf, dunkle Ränder, metallische Säume.
2. **WatercolorWetInWet** (8) [T: Farbe] -- Aquarell nass in nass, Farben bluten ineinander.
3. **InkRicePaperBleed** (8) [T: Farbe] -- Tusche frisst sich in Reispapier, Faserblüten.
4. **SaltWatercolorBlooms** (8) [T: Farbe] -- Salz auf nassem Aquarell lässt Sternblüten entstehen.
5. **MilkDyeBurst** (8) [T: Farbe] -- Farbe auf Milch flieht vor einem Tropfen Spülmittel.
6. **OilDropsOnWater** (9) [T: Grund] -- Öltropfen auf Wasser über der Textur, jeder eine Linse mit Interferenzsaum.
7. **RedCabbageIndicator** (7) [T: Farbe] -- pH-Wolken wechseln von Rot über Violett zu Grün.
8. **ResinGeodePour** (8) [T: Farbe] -- Harz-Güsse mit Goldrändern und Kristallkernen.
9. **GlitterSwirlLiquid** (8) [T: Farbe] -- Glitzer wirbelt in Flüssigkeit.
10. **TexturePaintPour** (8) [T: Farbe] -- die Textur fließt als Farbe und bildet Zellen.
11. **TexturePigmentBurst** (8) [T: Farbe] -- die Textur zerstäubt in Zeitlupe zu Pigment und setzt sich wieder.
12. **TextureSmokeDissolve** (8) [T: Stoff] -- die Textur löst sich in einer Curl-Strömung als Rauch auf.
13. **TextureLiquidGold** (8) [T: Adern] -- die hellen Adern werden flüssiges Gold.
14. **TextureMarbleSwirlGlass** (8) [T: Farbe] -- die Textur in Glasschmelze verwirbelt.
15. **CoffeeRingStains** (7) [T: Farbe] -- Kaffeeringe mit dunklen Rändern überlagern sich.
16. **TextureSuminagashiDrops** (8) [T: Farbe] -- Tropfen aus Texturfarben ziehen Ringe, die verwehen.
17. **TextureDyeInWaterTop** (8) [T: Farbe] -- Farbtropfen sinken in Wasser, von oben gesehen.
18. **TextureOilPaintMixing** (8) [T: Farbe] -- Farben werden mit dem Spachtel gemischt.
19. **TextureChromatographyRings** (8) [T: Farbe] -- eine Rundfilter-Chromatographie, die Farben wandern radial auseinander.
20. **TextureBatikCrackle** (8) [T: Farbe] -- Batik mit Wachsrissen, die Farbe zieht in die Risse.
21. **TextureSpillBloom** (8) [T: Farbe] -- verschüttete Farbe breitet sich mit dunklen Rändern aus.
22. **TextureBleachReveal** (8) [T: Paar] -- Bleiche frisst tex0 weg, darunter erscheint tex1.
23. **TextureEmulsionSwirl** (8) [T: Farbe] -- eine Öl-Wasser-Emulsion verwirbelt.
24. **TextureWickingFibres** (7) [T: Farbe] -- Farbe zieht in Fasern.
25. **TextureMetallicPaintSwirl** (8) [T: Farbe] -- Metallic-Lack verwirbelt, die Flocken wechseln die Farbe.

## 9. Generative Muster (25)

*Endlos:* Muster, die für jede Koordinate definiert sind. *Knöpfe:*
Zellgröße, Dichte, Strichstärke, Regelwahl, Tempo. *Musik in der Struktur:*
Tonart → Regel bzw. Bogenform, Rauheit → Unruhe, Harmoniewechsel → Umbau
einer Region (stetig), Spektralbreite → Dichte.

1. **TruchetFlowWeave** (9) [T: Farbe] -- Truchet-Bögen bilden fließende Bänder, Licht schiebt sich hindurch.
2. **FidenzaStrokes** (8) [T: Farbe] -- Farbbänder folgen einem Strömungsfeld, dicht und endlos.
3. **WaveFunctionTiles** (8) [T: Kacheln] -- Wave-Function-Collapse-Kacheln setzen sich stetig um.
4. **CirclePackingBloom** (8) [T: Farbe] -- Kreispackungen wachsen und vergehen.
5. **DifferentialGrowthFolds** (8) [T: Farbe] -- eine Linie wächst und faltet sich zu Hirnwindungen.
6. **HitomezashiStitch** (8) [T: Flächen] -- Sashiko-Stichmuster, die Flächen dazwischen aus Textur.
7. **SubstrateCracks** (8) [T: Farbe] -- Risslinien mit Farbsäumen verzweigen sich.
8. **PlotterContourField** (8) [T: Höhen] -- Konturlinien in vielen Stiftfarben.
9. **RecursiveRectSubdivision** (8) [T: Flächen] -- Rechtecke teilen sich rekursiv.
10. **MarchingSquaresIsobands** (8) [T: Höhen] -- Isoflächen-Bänder, weich schattiert.
11. **CrossHatchPhoto** (8) [T: Bild] -- die Textur als Kreuzschraffur.
12. **SingleLinePhoto** (8) [T: Bild] -- die Textur aus einer einzigen durchlaufenden Linie.
13. **ThreadNailPhoto** (7) [T: Bild] -- die Textur als Fadenbild zwischen Nägeln.
14. **TenPrintMaze** (7) [T: Farbe] -- ein 10PRINT-Labyrinth, Lichtpakete laufen hindurch.
15. **CellularCascadeBeads** (8) [T: Farbe] -- Zellautomaten als Gewebe aus runden Perlen.
16. **PhotoLowPolyFacets** (8) [T: Bild] -- die Textur als Low-Poly-Fläche, die Facetten glänzen.
17. **PhotoWovenThreads** (8) [T: Bild] -- die Textur aus Kett- und Schussfäden.
18. **BezierRibbonWeave** (8) [T: Farbe] -- Bézier-Bänder verflechten sich.
19. **ScribbleCloud** (7) [T: Bild] -- Kritzelwolken verdichten sich zu Formen und lösen sich wieder.
20. **TextureDelaunayLightNet** (8) [T: Punkte] -- ein Delaunay-Netz aus den hellen Punkten, die Kanten leuchten.
21. **StripePhoto** (8) [T: Bild] -- die Textur aus bewegten Streifen verschiedener Dicke.
22. **ConcentricPhoto** (8) [T: Bild] -- die Textur aus konzentrischen Ringen, deren Dicke sie moduliert.
23. **SpiralPhoto** (8) [T: Bild] -- die Textur als eine einzige Spirallinie.
24. **TextureMazeGrowth** (8) [T: Farbe] -- ein Labyrinth wächst in Texturfarben.
25. **TextureFlowFieldHair** (8) [T: Feld + Farbe] -- Haare folgen dem Feld der Textur.

## 10. Selbstorganisation und künstliches Leben (25)

*Endlos:* Simulationen auf einem Torus, also nahtlos kachelbar. *Knöpfe:*
Arten, Reichweite, Tempo, Dichte, Kopplung. *Musik in der Struktur:*
Tonart → Regelparameter, Rauheit → Rauschen, Spektralbreite → Reichweite,
Harmoniewechsel → Impuls. Wo es geht, ist die Textur der Nährboden.

1. **TextureLeniaHabitat** (9) [T: Nahrung] -- Lenia-Wesen leben auf der Textur, die Helligkeit ist ihre Nahrung.
2. **LeniaOrbium** (8) [T: Farbe] -- Lenia-Wesen gleiten als leuchtende Zellen.
3. **ParticleLifeClusters** (9) [T: Farbe] -- farbige Teilchen bilden Zellen, Jäger und Ketten.
4. **SmoothLifeGliders** (8) [T: Farbe] -- kontinuierliches Game of Life mit runden Gleitern.
5. **KuramotoRings** (8) [T: Farbe] -- Oszillatoren synchronisieren sich in Farbwellen.
6. **SandpileAvalanche** (8) [T: Farbe] -- Lawinen eines Sandhaufens als Lichtwellen.
7. **PercolationFlow** (7) [T: Poren] -- Flüssigkeit sickert durch ein Porennetz aus der Textur.
8. **SwarmChemistry** (8) [T: Farbe] -- Schwärme mehrerer Arten mischen sich zu Mustern.
9. **ChemotaxisTrails** (8) [T: Duft] -- Zellen folgen Duftspuren aus der Textur und hinterlassen Leuchtspuren.
10. **ActiveNematicDefects** (9) [T: Farbe] -- Stäbchenfelder mit wandernden Defekten, die Farbe folgt der Orientierung.
11. **MotileDroplets** (8) [T: Farbe] -- Tropfen jagen einander.
12. **CellSortingTissue** (7) [T: Farbe] -- Zellen sortieren sich in Farbinseln.
13. **ColloidCrystallization** (8) [T: Farbe] -- Kolloidkugeln ordnen sich zu Kristallen, die Korngrenzen glühen.
14. **FoamCoarsening** (8) [T: Füllung] -- ein Schaum vergröbert sich, die Kanten leuchten.
15. **EutecticLamellae** (8) [T: Farbe] -- Erstarrungslamellen wachsen.
16. **MetalDendriteGrowth** (8) [T: Spiegelung] -- Metalldendriten wachsen spiegelnd.
17. **TextureAntTrails** (8) [T: Ziele] -- Ameisenstraßen zwischen den hellen Stellen.
18. **TextureCoralAccretion** (8) [T: Nahrung] -- Korallen wachsen die Textur entlang.
19. **TextureBacteriaColonies** (8) [T: Farbe] -- Kolonien wachsen, verzweigen sich und verdrängen einander.
20. **TextureGrainGrowth** (8) [T: Körner] -- Körner wachsen und schlucken einander, jedes in seiner Texturfarbe.
21. **TextureCrystalSeeds** (8) [T: Farbe] -- Kristallisationskeime wachsen zu Körnern.
22. **VicsekRivers** (8) [T: Farbe] -- Schwärme bilden Flüsse.
23. **TextureMitosisField** (8) [T: Zellinhalt] -- Zellen mit Texturinhalt teilen sich.
24. **TextureNeuronGrowth** (8) [T: Nahrung] -- Neuronen wachsen und feuern Licht.
25. **TextureBoidsInk** (8) [T: Farbe] -- ein Schwarm hinterlässt Tintenspuren in Texturfarben.

## 11. Optik und Linsenfelder (25)

*Endlos:* Linsen, Tropfen oder Glas als Feld über der Textur. *Knöpfe:*
Linsengröße, Brechkraft, Dichte, Dispersion, Schärfe. *Musik in der
Struktur:* Spektralbreite → Brechkraft, Rauheit → Wellung, Tonart →
Dispersion, Swell → Schärfe (langsam).

1. **DewdropLensArray** (9) [T: durch Linse] -- ein Feld von Tautropfen, jeder zeigt die Textur scharf und kopfstehend.
2. **TextureRainWindowLenses** (8) [T: dahinter] -- die Textur hinter nassem Glas, die Tropfen als Linsen.
3. **TextureWaterSurfaceLookUp** (8) [T: als Himmel] -- von unten durch die Wasseroberfläche: die Textur im Snell-Fenster.
4. **TextureDewWeb** (8) [T: durch Tropfen] -- ein Spinnennetz mit Tautropfen, jeder Tropfen eine Linse.
5. **TextureFocusPull** (7) [T: Bild] -- die Textur zwischen Bokeh und Schärfe.
6. **TextureChromaticParallax** (8) [T: Kanäle] -- die RGB-Kanäle als drei Tiefenebenen mit Parallaxe.
7. **TextureGlassBlocksWall** (8) [T: dahinter] -- Glasbausteine brechen die Textur.
8. **TextureFresnelZones** (7) [T: vergrößert] -- Fresnel-Zonen bündeln die Textur.
9. **TextureCrystalBallField** (8) [T: umgekehrt] -- ein Feld von Glaskugeln, jede zeigt die Textur umgekehrt.
10. **TextureShowerGlass** (7) [T: zerlegt] -- geriffeltes Glas zerlegt die Textur in Streifen.
11. **ThinSectionPolarized** (9) [T: Körner] -- die Textur als Dünnschliff zwischen gekreuzten Polfiltern, die Interferenzfarben wandern mit dem Drehtisch.
12. **CellophanePolarized** (8) [T: Schichten] -- Folienschichten zwischen Polfiltern leuchten in Interferenzfarben.
13. **TextureNewtonRings** (8) [T: Grund] -- Newtonsche Ringe über der Textur, farbig und atmend.
14. **FiberBundlePhoto** (8) [T: Bild] -- ein Glasfaserbündel zeigt die Textur als Mosaik runder Leuchtpunkte.
15. **FlyEyeLensArray** (8) [T: Bild] -- die Textur durch ein Facettenauge.
16. **WaterGlassRefraction** (8) [T: dahinter] -- die Textur hinter bewegtem Wasser in Glas.
17. **CylinderAnamorphosis** (7) [T: verzerrt] -- eine Anamorphose, die ein Zylinderspiegel entzerrt.
18. **ChromaticFringeEdges** (7) [T: Kanten] -- Farbsäume an den Kontrastkanten.
19. **TextureCausticCeiling** (9) [T: Oberfläche] -- die Textur als Wasseroberfläche, die ein wanderndes Kaustiknetz wirft.
20. **TextureGloryRings** (8) [T: Grund] -- farbige Glorie-Ringe über der Textur.
21. **TextureBubbleWrap** (7) [T: dahinter] -- Noppenfolie über der Textur, jede Noppe eine Linse.
22. **TexturePrismSheet** (8) [T: zerlegt] -- Prismenfolie zerlegt die Textur in Spektren.
23. **TextureFrostedWipe** (8) [T: dahinter] -- eine beschlagene Scheibe, wandernde Wischspuren klären den Blick.
24. **TextureIceLensField** (8) [T: dahinter] -- Eislinsen und Blasen über der Textur.
25. **TextureMagnifierSweep** (8) [T: vergrößert] -- Vergrößerungsfelder gleiten über die Textur.

## 12. Aufsicht und Karten (25)

*Endlos:* senkrechter Blick auf eine Fläche, die überall weitergeht.
*Knöpfe:* Maßstab, Flussmenge, Lichtwinkel, Dichte, Tempo. *Musik in der
Struktur:* Spektralbreite → Relief, Rauheit → Wellen, Tonart → Tageslicht,
`audioAdvance` → Drift.

1. **TextureRiverDelta** (8) [T: Gelände] -- Wasser sucht sich die Täler der Textur, glitzernde Flussarme.
2. **TextureSaltTerraces** (8) [T: Farbe] -- Salinenbecken in Stufen, jedes in einer Texturfarbe, spiegelnd.
3. **TextureCityFromAbove** (8) [T: Dächer] -- eine Stadt von oben, die Dächer aus Textur, Straßenlichter dazwischen.
4. **WindMapStreamlines** (9) [T: Feld + Farbe] -- Windkarten-Stromlinien über der Textur, Farbe nach Tempo.
5. **OceanCurrentMap** (8) [T: Feld] -- Meeresströmungen als leuchtende Stromlinien.
6. **WeatherRadarSweep** (8) [T: Gelände] -- ein Radarstrahl dreht stetig, Echos leuchten auf.
7. **SeismicWavefronts** (8) [T: Gelände] -- Wellenfronten laufen über die Textur und brechen an Grenzen.
8. **TextureCityLightsOrbit** (8) [T: Städte] -- die Textur als Nachtseite, die hellen Stellen werden Städte und Straßennetze.
9. **TextureDayNight** (8) [T: Paar] -- tex0 als Tagseite, tex1 als Nachtseite, der Terminator gleitet.
10. **TextureCoralReefTop** (8) [T: Riff] -- ein Riff von oben, Kaustik, Farben aus der Textur.
11. **TextureMangroveChannels** (8) [T: Gelände] -- verzweigte Kanäle in dunklem Grün.
12. **TextureIceFloes** (8) [T: Eis] -- Eisschollen aus Textur driften über dunklem Wasser.
13. **TextureLavaFieldTop** (9) [T: Kruste] -- ein Lavafeld von oben, Adern glühen, die Kruste kühlt.
14. **TextureDunesTop** (8) [T: Relief] -- Dünen von oben, Kämme im Streiflicht.
15. **TextureGlacierTop** (8) [T: Eis] -- ein Gletscher von oben, blaue Spalten.
16. **TextureMicroscopeSlide** (8) [T: Präparat] -- ein gefärbtes Präparat unter dem Mikroskop, Fokus wandert.
17. **TextureSatelliteClouds** (8) [T: Gelände] -- Wolkenwirbel über der Textur, ihre Schatten darunter.
18. **IkedaDataStreams** (8) [T: Daten] -- Datenströme aus den Werten der Textur, stetig laufend.
19. **ChordDiagramFlows** (7) [T: Farbe] -- Chord-Bänder zwischen Segmenten.
20. **SankeyRivers** (7) [T: Farbe] -- Sankey-Ströme verzweigen und vereinen sich.
21. **PhyloRadial** (7) [T: Farbe] -- ein radialer Stammbaum, Zweige leuchten auf.
22. **TreemapBreathing** (7) [T: Füllung] -- Treemap-Flächen wachsen und schrumpfen.
23. **TextureBraidedRiver** (8) [T: Gelände] -- ein verflochtener Gletscherfluss, türkis.
24. **TextureAlgaeBloomTop** (8) [T: Farbe] -- eine Algenblüte in Wirbeln aus Texturfarben.
25. **TextureShipWakesTop** (7) [T: Meer] -- Kielwasserlinien kreuzen sich über einem Meer aus Textur.

---

## 13. Flüssiges Licht und zähe Stoffe (25)

Die vorhandenen **LavaLamp** und **OilProjector** reichen nicht an die
Originale heran: die LavaLamp ist ein Gefäß in der Bildmitte mit
Metaballs, der OilProjector ein verzerrter Strömungswirbel statt echter
Zweiphasen-Öle. Was die Originale ausmacht und hier nachgebaut werden soll:
**scharfe Grenzflächen nicht mischbarer Phasen**, Blasen und Einschlüsse,
**Auftrieb und Wärme** als Motor (langsam, zäh, nie ruckartig),
**Durchleuchtung** (Subsurface-Glühen im Wachs, kräftige Farbstoffe im
Gegenlicht), bei Projektionen die **Optik** (Vergrößerung, Unschärfe an den
Blasenrändern, Farbsäume der Linse, überlappende Projektorkreise).
*Knöpfe:* Viskosität, Wärme, Phasenzahl, Blasenmenge, Tempo. *Musik:* Swell
→ Wärme (langsam), Spektralbreite → Viskosität, Tonart → Farbstoff,
schnelle Hüllkurven nur ins Licht. Farbstoffe aus der Textur, wo es passt.

1. **OilProjector** (9) [Neubau] -- ein Mathmos-Ölrad nah am Original: zwei nicht mischbare Farböle und Wasser zwischen Glas, das Rad dreht langsam, Blasen wandern, projiziert mit Vergrößerung, Randunschärfe und Farbsäumen; mehrere Projektorkreise überlappen zu einer endlosen Fläche.
2. **LavaLamp** (9) [Neubau] -- das Innere einer Lavalampe, bildfüllend: Wachs steigt über der Wärme auf, schnürt sich zu Hälsen ab, verschmilzt und sinkt, glüht von innen.
3. **LiquidLightShow** (9) [T: Farbstoff] -- die 60er-Lichtshow vom Overheadprojektor: Uhrgläser mit Farbe, Öl und Wasser werden gedrückt und geschwenkt, die Farben quellen ineinander.
4. **RheoscopicSwirl** (9) [T: Tönung] -- eine rheoskopische Flüssigkeit, deren Perlglanz jede Strömung sichtbar macht, langsame Wirbel und Scherbänder.
5. **WaxDripCascade** (8) [T: Wachsfarbe] -- Kerzenwachs läuft in Farbschichten übereinander und erstarrt.
6. **HoneyFold** (8) [T: Gegenlicht] -- ein Honigfaden faltet sich zu Spulen, das Licht bricht golden hindurch.
7. **SyrupCurtain** (8) [T: dahinter] -- ein zäher Vorhang läuft über Glas, die Textur dahinter gebrochen.
8. **DropCoalescence** (8) [T: in den Tropfen] -- Tropfen auf Glas verschmelzen in Kaskaden, jeder bricht die Textur.
9. **MilkCrownSplash** (8) [T: Farbe] -- ein Kronenspritzer in Zeitlupe, endlos.
10. **InkDropsFalling** (8) [T: Farbe] -- Tintentropfen fallen in Wasser und bilden Wirbelringe.
11. **BubbleOilLamp** (8) [T: Öl] -- Luftblasen steigen durch gefärbtes Öl und brechen das Licht.
12. **HotWaxBlobsTop** (8) [T: Farbe] -- Wachs auf einer warmen Platte, von oben, Blobs fließen zusammen.
13. **CaramelBubbling** (8) [T: Farbe] -- kochender Zucker, Blasen steigen, die Farbe dunkelt.
14. **EpoxyWaves** (8) [T: Farbe] -- Harzkunst als Brandung von oben, mit Zellen und weißem Spitzensaum.
15. **BubbleRaftDrift** (8) [T: Grund] -- Blasenflöße mit Interferenzfarben treiben auf Wasser.
16. **ThermochromicSheet** (8) [T: Wärmebild] -- eine Thermofarbfolie, auf der Wärmespuren in Farben aufblühen.
17. **DyedIceMelt** (8) [T: Farbe] -- gefärbtes Eis schmilzt, die Farbe läuft in Rinnsalen.
18. **HeatHazeOverFlames** (8) [T: dahinter] -- Hitzeflimmern über Flammen verzerrt die Textur.
19. **InkInOilDroplets** (8) [T: Farbe] -- Tinte in schwebenden Öltropfen gefangen.
20. **DichroicOilWheel** (8) [T: Farbe] -- ein Ölrad mit dichroitischem Glas, die Farben kippen mit dem Winkel.
21. **OilWheelMacro** (8) [T: Farbe] -- das Makro der Ölschicht im Rad, Grenzflächen und Einschlüsse.
22. **MeltingCrayonRainbow** (7) [T: Farbe] -- Wachsmalstifte schmelzen, die Farben laufen.
23. **WalkingDroplets** (8) [T: Grund] -- Tropfen hüpfen auf einem vibrierenden Ölbad und ziehen Wellenmuster hinter sich her.
24. **LiquidMarbleSpheres** (7) [T: Pulver] -- mit Pulver ummantelte Tropfen rollen und verschmelzen.
25. **TextureMeltingGlaze** (8) [T: Glasur] -- die Textur schmilzt als Glasur, Tropfen laufen.

---

**Summe:** 13 Familien, 325 Ideen (Familie 13 mit den Neubauten von
LavaLamp und OilProjector).
