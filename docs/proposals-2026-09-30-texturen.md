# 100 Szenen, die nativ auf dem Texturen-Pool aufbauen (Vorschläge vom 30.09.2026)

## Die Skala

Schauwert ist die Spalte `interest` in `Tools/preset_fit.tsv`, definiert als
**0 bis 10** (`Tools/make_genre_configs.py`). Verteilung der 948 bewerteten
Szenen: 3 → 99, 4 → 154, 5 → 243, 6 → 222, 7 → 149, 8 → 69, **9 → 12**,
10 → keine. Eine 6 ist also Mittelfeld, 8 ist das obere Zehntel, 9 die Spitze.

**Die zwölf Neuner:** BioluminescentCombJellyCydippid, ChromeDreams,
DiscoGodrays, InsideSystem, NeonSignAlley, NeonTubes, NoiseSpiral, ShipFlyby,
TempleLanternHall, TheCore, Vortex, Voyager. Gemeinsam: **Leuchten im Dunkeln,
Tiefe oder Flug, Volumenlicht oder Neon, kräftige Farbe, stetige Bewegung.**
Daran sind die Ideen unten ausgerichtet; die Klammer ist meine Schätzung auf
dieser Skala.

**Korrektur:** Die Blöcke 5–15a (53 Szenen) habe ich bei der Aufnahme selbst
mit 6–8 bewertet, ohne sie in der App gesehen zu haben — 25 von ihnen stehen
jetzt bei 8. Das ist zu hoch angesetzt; sie werden nach den App-Renders neu
bewertet.

## Der Pool

977 Materialfotos, 1024×1024, in rund 120 Familien, darunter drahtwolle (23),
basaltsaeule (22), suminagashi (21), meteorit (21), kokon (20), wollfilz,
schimmelrasen, eiskern, betonbruch, verwitterung, pigmenthaufen,
polarisation, lehmriss, kandiszucker, harzeinschluss, bruchglasur, terrazzo,
prismenbrechung, gischt, spinnwebe, seifenschaum, knitterpapier, eisblase,
interferenz, blattgold, erzader, craquele, chromatographie, achat, malachit,
perlmutt, obsidian, kupferpatina, polarlicht, plasmabogen, kaustik …

Das Foto liegt in `tex0`/`tex1` und wechselt mit `interpolation`. Viele
vorhandene Szenen nutzen es bereits — fast immer als **Bildfläche, die
verzerrt wird** (Kaleidoskop, Tunnel, Kugel, Wirbel, Splitter, Zoom, Relief).
Die Ideen hier nutzen es anders: **als Welt, Volumen, Licht, Kraftfeld oder
Stoff.** Dadurch wird jede Szene mit jedem der 977 Fotos ein anderes Bild,
und der Fotowechsel bringt die Abwechslung von selbst.

**Bausteine, die viele Ideen teilen** (einmal sauber gebaut, oft verwendet):
- *Höhe aus Helligkeit:* Luma über eine grobe Mip-Stufe (`textureLod`) als
  Höhenfeld, feine Stufe als Detail; Normale aus dem Gradienten.
- *Kantenbild:* Gradientenbetrag der Luma → Linien für Neon, Risse, Leiterbahnen.
- *Segmente:* Voronoi-Zellen, deren Farbe der Textur-Mittelwert der Zelle ist
  (Fenster, Mosaik, Laternenschirme).
- *Feld:* Gradient bzw. dessen Senkrechte als Strömungsfeld für Teilchen und
  Wachstum.
- *Paar:* tex0 und tex1 gleichzeitig in zwei Rollen statt nur überblendet.

Musik wie immer nur im Licht, in der Farbe und der Dichte, nie in Kamera,
Zoom oder Drehung.

**Womit ich anfangen würde:** TextureGoboBeams, TextureNeonTrace,
TextureLanternField, TextureStainedGlassNave, TextureCanyonFlight,
TextureLuminanceCity, TextureNebulaVolume, TextureSunlitClouds,
TextureLavaCracks, TextureFlowParticles, TextureLightningPaths,
TextureCrystalCluster, TextureMosaicDome, TwoTextureWorld.

---

## A. Textur als Welt (10)

1. **TextureCanyonFlight** (9) -- Helligkeit wird Höhe: ein Flug durch Schluchten aus Meteorit, Basalt oder Lehmriss, Gegenlicht und Dunst in der Tiefe, die Farben der Textur auf dem Fels. Swell = Dunst, Bass = Sonnenrand.
2. **TextureArchipelagoCloudSea** (8) -- die hellsten Stellen der Textur ragen als Inseln aus einem sonnigen Wolkenmeer.
3. **TextureLuminanceCity** (9) -- jede Zelle der Textur wird ein Turm, Höhe = Helligkeit, Fensterlicht in der Texturfarbe; Nachtflug über die Stadt. Bänder = Fensterfamilien.
4. **TextureTerraceFields** (8) -- Helligkeit in Stufen: Terrassen voll spiegelndem Wasser, jede Stufe in der Farbe der Textur, Abendlicht.
5. **TextureDuneSea** (8) -- die weich gefilterte Textur als Dünenmeer, Kämme im Streiflicht, Schattentäler.
6. **TextureIceShelfCliffs** (8) -- die Textur als Kante eines Schelfeises über dunklem Meer, Spiegelung, blaues Innenleuchten.
7. **TextureCaveCathedral** (9) -- die Textur kleidet die Wände einer Riesenhöhle, Lichtschächte fallen durch Öffnungen, Staub im Licht.
8. **TextureCoralReefFlight** (8) -- die Textur als Riffoberfläche, Kaustik darüber, Gleitflug knapp über dem Grund.
9. **TextureRiverDelta** (8) -- von oben: Wasser sucht sich die Täler der Textur, glitzernde Flussarme, Sonnenreflexe.
10. **TextureFloatingIslands** (8) -- Stücke der Textur als schwebende Inseln, Lichtfälle stürzen von ihren Rändern.

## B. Textur als Volumen (10)

1. **TextureNebulaVolume** (9) -- die Textur in Schichten gestapelt als Volumennebel, Flug hindurch, Sterne dahinter.
2. **TextureSunlitClouds** (9) -- Helligkeit als Wolkendichte, die Sonne dahinter, Silberränder und Strahlen im Dunst.
3. **TextureSmokeChamber** (8) -- Rauch in den Farben der Textur wirbelt durch Lichtkegel.
4. **TextureAuroraVolume** (8) -- die Texturfarben als Polarlichtvorhänge, in der Tiefe gestaffelt.
5. **TextureUnderwaterHaze** (8) -- Tauchen durch Wasser, dessen Trübung und Farbe aus der Textur kommen, Lichtstrahlen von oben.
6. **TextureDustStorm** (7) -- eine Staubwand in Texturfarben im Gegenlicht.
7. **TextureGasGiantBands** (8) -- die Textur zu Wolkenbändern eines Gasriesen gestreckt, Wirbel an den Rändern.
8. **TextureGalaxyArms** (8) -- die Texturfarben als Spiralarme einer Galaxie, Staubbahnen aus den dunklen Stellen.
9. **TextureIncenseSpiral** (7) -- Räucherrauch in Spiralen, Farbe aus der Textur, Streiflicht.
10. **TextureFogLayersParallax** (7) -- Nebelbänke aus der Textur in sechs Tiefenebenen.

## C. Textur als Licht (10)

1. **TextureGoboBeams** (9) -- Scheinwerfer projizieren die Textur durch Dunst: farbige Volumenkegel, auf der Rückwand das Bild. Kick = Strahlhelligkeit.
2. **TextureStainedGlassNave** (9) -- Kirchenfenster aus der segmentierten Textur, farbige Strahlen im Dunst, Farbflecken auf dem Steinboden.
3. **TextureLanternField** (9) -- hunderte Laternen, deren Schirme Texturstücke sind, gestaffelt bis in die Tiefe.
4. **TextureLightboxGallery** (8) -- ein dunkler Gang mit hinterleuchteten Texturtafeln, Spiegelboden.
5. **TextureCausticCeiling** (8) -- die Textur als Wasseroberfläche, die Kaustik auf eine Decke wirft.
6. **TexturePaperLampCluster** (8) -- eine Traube schwebender Papierlampen, jede aus einem Stück Textur.
7. **TextureWindowLightRoom** (8) -- Sonne fällt durch ein Fenster aus Textur in einen dunstigen Raum.
8. **TextureLaserScan** (8) -- Laser zeichnen die Konturen der Textur in Nebel.
9. **TextureLEDWallDots** (8) -- eine riesige Wand aus runden LED-Punkten zeigt die Textur, Strahlen und Dunst davor.
10. **TextureSunThroughAmber** (8) -- Gegenlicht durch die Textur als transluzente Scheibe (Harz, Achat), Streuung und Glühen.

## D. Textur als Neon und Glühen (10)

1. **TextureNeonTrace** (9) -- die Kanten der Textur werden Neonröhren mit Halo, darunter ein nasser Spiegelboden.
2. **TextureUVBlacklight** (8) -- die Textur als fluoreszierende Farbe unter Schwarzlicht: helle Bereiche glühen neon.
3. **TextureLavaCracks** (9) -- die dunklen Risse der Textur glühen wie Lava durch, die Kruste dazwischen kühlt dunkel ab.
4. **TextureEmberBed** (8) -- die Textur als Glutbett, Helligkeit = Glut, runde Funken steigen auf.
5. **TextureCircuitGlow** (8) -- die Kanten der Textur als Leiterbahnen, Lichtpulse laufen darauf.
6. **TextureFiberOptic** (8) -- ein Glasfaserbüschel, jede Spitze leuchtet in der Farbe der Textur an ihrer Stelle.
7. **TextureHologramLayers** (8) -- die Textur als mehrere holografische Scanlinien-Ebenen in der Tiefe.
8. **TextureBioluminescentShore** (8) -- Wellen lösen an den hellen Stellen der Textur Leuchten aus.
9. **TextureElectroluminescent** (8) -- die Textur als Leuchtfolie: Flächen leuchten in Bändern nacheinander auf.
10. **TextureGlowingIce** (8) -- die Textur als Eisblock, innen blau durchleuchtet, Risse glühen.

## E. Textur als Architektur und Ornament (10)

1. **TextureMosaicDome** (9) -- eine Kuppel aus Mosaiksteinen in den Farben der Textur, Goldfugen, Licht fällt durch die Öffnungen.
2. **TextureColonnade** (8) -- eine Säulenhalle aus Textur-Marmor, im Wasser gespiegelt.
3. **TextureRoseWindow** (8) -- eine Fensterrose, die Segmente aus der Textur, Licht dahinter.
4. **TextureInfiniteArches** (8) -- eine Bogenreihe, die Laibungen mit der Textur belegt, ein Lichtband läuft hindurch.
5. **TextureMuqarnasCells** (8) -- Muqarnas-Zellen, jede mit ihrem Stück Textur.
6. **TextureZigguratSteps** (7) -- eine Stufenpyramide mit Texturflächen im Gegenlicht.
7. **TexturePaintedVault** (8) -- die Textur als Fresko auf einem Gewölbe, Kerzenlicht.
8. **TextureSkylightAtrium** (8) -- ein Atrium unter einem Glasdach aus Texturscheiben, farbiges Licht fällt herab.
9. **TextureLatticeScreen** (8) -- ein Jali-Gitter aus Stein, die Textur dahinter, Lichtmuster auf dem Boden.
10. **TextureMirrorPavilion** (8) -- ein Pavillon aus einzelnen Spiegelplatten, jede zeigt ein anderes Stück Textur.

## F. Textur als Material auf Formen (10)

1. **TextureMonolithGrove** (8) -- polierte Monolithe mit der Textur, die einander spiegeln, Dunst.
2. **TextureGiantMarbles** (8) -- riesige Glasmurmeln mit einem Kern aus Textur, Brechung und Kaustik.
3. **TextureCrystalCluster** (9) -- eine Kristallstufe, die Textur im Inneren, Facetten blitzen im Licht.
4. **TextureChromeBlobs** (9) -- Chromformen spiegeln die Textur als Umgebung (Variante von ChromeDreams, vorher prüfen).
5. **TextureCeramicGlazeSpheres** (8) -- Kugeln mit Glasur aus der Textur, Glanzlichter.
6. **TextureGemCut** (9) -- ein Brillant, dessen Facetten Scherben der Textur spiegeln, Feuer.
7. **TextureStackedDiscs** (7) -- gestapelte Scheiben, jede ein Schnitt der Textur, gegeneinander versetzt.
8. **TextureFoldedPaperFan** (7) -- ein Fächer aus der Textur, die Falten im Licht.
9. **TextureHelixBands** (8) -- ein Band aus Textur windet sich endlos durch den Raum.
10. **TextureInflatedPillows** (8) -- aufgeblasene Kissen mit Texturglanz.

## G. Textur als Kraftfeld (10)

1. **TextureFlowParticles** (9) -- Millionen Teilchen folgen dem Gradientenfeld der Textur und tragen ihre Farbe (Refik-Anadol-Stil).
2. **TextureLightningPaths** (9) -- Blitze wandern die dunklen Risse der Textur entlang. Kick = Entladung (Licht).
3. **TextureGlowVines** (8) -- leuchtende Ranken wachsen die hellen Grate der Textur entlang.
4. **TextureStarsFromLight** (8) -- die hellen Stellen werden Sterne in der Tiefe, stetiger Flug.
5. **TextureCityLightsOrbit** (8) -- die Textur als Nachtseite eines Planeten, helle Stellen werden Städte und Straßennetze.
6. **TextureIronFilings** (7) -- Eisenspäne richten sich nach dem Gradienten der Textur aus.
7. **TextureContourNeonMap** (8) -- die Höhenlinien der Helligkeit als Neon, die Kamera gleitet darüber.
8. **TextureFireflyGathering** (8) -- Glühwürmchen sammeln sich an den hellen Stellen und ziehen weiter.
9. **TextureRainTrickle** (8) -- Regentropfen laufen dem Gefälle der Textur nach über eine Scheibe, die Textur dahinter unscharf.
10. **TextureMurmurationShape** (8) -- ein Starenschwarm zeichnet die Helligkeit der Textur nach.

## H. Textur als Stoff (10)

1. **TexturePaintPour** (8) -- die Textur fließt als Farbe einen Hang hinab und bildet Zellen.
2. **TextureMeltingGlaze** (8) -- die Textur schmilzt als Glasur, Tropfen laufen.
3. **TextureSandArtLayers** (8) -- ein Sandbild zwischen Glasplatten: die Texturfarben rieseln in Schichten.
4. **TexturePigmentBurst** (8) -- die Textur zerstäubt in Zeitlupe zu einer Pigmentwolke und setzt sich wieder.
5. **TextureInkBleed** (7) -- die Textur blutet als Tinte in nasses Papier.
6. **TextureSmokeDissolve** (8) -- die Textur löst sich in einer Curl-Strömung als Rauch auf.
7. **TextureLiquidGold** (8) -- die hellen Adern werden flüssiges Gold und fließen.
8. **TextureCrackedMudDry** (7) -- die Textur trocknet zu Schollen, Risse öffnen sich.
9. **TextureHoneyDrip** (8) -- die Textur als Honig oder Harz, zähe Tropfen im Gegenlicht.
10. **TextureMarbleSwirlGlass** (8) -- die Textur in Glasschmelze verwirbelt.

## I. Textur durch Optik (10)

1. **TextureRainWindowLenses** (8) -- die Textur hinter einem nassen Fenster, jeder Tropfen zeigt sie scharf und kopfstehend.
2. **TextureWaterSurfaceLookUp** (8) -- von unten durch die Wasseroberfläche: die Textur als Himmel im Snell-Fenster.
3. **TextureDewWeb** (8) -- ein Spinnennetz mit Tautropfen, jeder Tropfen eine Linse auf die Textur.
4. **TextureFocusPull** (7) -- die Textur zwischen Bokeh und Schärfe, das Bokeh aus ihren hellen Stellen.
5. **TextureChromaticParallax** (8) -- die RGB-Kanäle als drei Tiefenebenen mit Parallaxe.
6. **TextureGlassBlocksWall** (8) -- Glasbausteine brechen die Textur dahinter.
7. **TextureFresnelLens** (7) -- eine Fresnel-Linse vergrößert die Textur, die Ringe glänzen.
8. **TextureCrystalBallRow** (8) -- eine Reihe Glaskugeln, jede zeigt die Textur umgekehrt, dahinter unscharf.
9. **TextureShowerGlass** (7) -- geriffeltes Glas zerlegt die Textur in Streifen.
10. **TextureOilOnWaterLens** (8) -- Öltropfen auf Wasser über der Textur, Linsen mit Interferenzsäumen.

## J. Textur-Paare: tex0 und tex1 zugleich (10)

1. **TwoTextureWorld** (9) -- tex0 als Landschaft, tex1 als Himmel und Licht: jede Paarung eine neue Welt.
2. **TextureVeinReveal** (8) -- tex1 wächst durch die hellen Adern von tex0.
3. **TextureMirrorLake** (8) -- tex0 oben, tex1 als Spiegelung mit Wellen darunter.
4. **TextureWeavePair** (7) -- Kettfäden aus tex0, Schussfäden aus tex1.
5. **TextureTidalExchange** (8) -- tex0 und tex1 als zwei Flüssigkeiten, deren Grenzfläche in Fingern ineinander greift.
6. **TextureDayNight** (8) -- tex0 als Tagseite, tex1 als Nachtseite eines Planeten, der Terminator gleitet.
7. **TextureLayerCutaway** (7) -- Schichtschnitte abwechselnd aus tex0 und tex1 wie Gesteinsschichten.
8. **TextureLightAndMatter** (8) -- tex0 als Material (Relief), tex1 als Lichtfarbe, die darüber wandert.
9. **TextureDoubleExposureForms** (7) -- Formen, gefüllt mit tex1, auf tex0.
10. **TexturePortalRings** (8) -- Ringe öffnen Durchblicke von tex0 nach tex1.

---

**Summe:** 10 Familien × 10 = 100. Davon 17 mit geschätzter 9, 68 mit 8,
15 mit 7.
