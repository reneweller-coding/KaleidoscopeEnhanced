# 130 Szenen mit hohem Schauwert (Vorschläge vom 29.09.2026)

Grundlage ist die Handbewertung aller 865 Szenen (`Tools/preset_fit.tsv`).
Was dort hohen Schauwert bekam, hat fast immer vier Dinge gemeinsam: das Bild
ist **ganz gefüllt** (kein Objekt auf Schwarz), es hat **Tiefe** (Flug durch
einen Raum, Dunst, Parallaxe), es **leuchtet** (Volumenlicht, Neon, Glühen,
Gegenlicht) und die **Farbe ist kräftig**. Was niedrig landete, waren
Alltagsgegenstände auf dunklem Grund, fast schwarze Weltraumbilder und
Szenen, die einen Bogen erzählen (etwas baut sich langsam auf).

Deshalb gilt für alle Vorschläge unten:

- **Kein Bogen.** Keine Szene liest `sceneProgress`; jede ist ein Zustand, der
  gleichmäßig läuft und von der ersten Sekunde an vollständig ist.
- **Bildfüllend und mit Tiefe.** Wo ein Objekt vorkommt, steht es in einem
  Raum, nicht vor Schwarz.
- **Die Musik sitzt im Licht**, nie in Kamera, Zoom oder Rotation (stehende
  Regel). Kamerafahrten laufen stetig auf der Szenenuhr.
- **Partikel sind rund**, alles läuft stetig, das Foto liefert die Palette.

Bewusst ausgelassen, weil der Katalog davon schon viel hat: Tunnel,
Kaleidoskope, Fraktal-Tauchgänge, Schwarze Löcher, Nebel, Raumschiffe und
Stationen, Quanten- und Festkörper-Physik, Biolumineszenz im Tiefsee-Stil,
Synthwave-Gitter, Handwerk und Mechanik.

**Womit ich anfangen würde** (höchster erwarteter Schauwert bei machbarem
Aufwand, über alle Genres verteilt): MusicalFountainShow, MirrorBallRoom,
NeonSignAlley, SolidLightCones, BasilicaCisternColumns, MuqarnasDome,
TempleLanternHall, CloudSeaSummit, WaterfallCurtainRainbow,
ThunderstormFromOrbit, StormLighthouse, RainOnWindowCity, HoliColourCloud,
DiamondFireMacro, StarryNightFlow, KlimtGoldMosaic, DiscoFloorTiles,
LaserMappedForest, JupiterJunoSwirls, WhirlingDervishes.

`[2D]` = Fragment-Shader, `[3D]` = Scene3D, `(Modell)` = braucht ein
generiertes 3D-Modell.

## A. Licht-Installationen und Bühne

1. **SolidLightCones** [2D] -- ein Projektor im Dunst wirft Lichtkegel, deren Grundlinien auf dem Boden sich langsam verformen (nach Anthony McCall); man steht zwischen massiven Lichtwänden. Bänder = Linienhelligkeit, Bass = Dunstdichte.
2. **WeatherProjectSun** [2D] -- eine riesige Halbsonne in einer Halle voller Nebel, die Spiegeldecke macht sie zum Kreis, Menschen als Silhouetten darunter (nach Olafur Eliasson). Swell = Nebel, Tiefen = Glühen.
3. **MusicalFountainShow** [3D] -- tanzende Wasserfontänen bei Nacht vor einer Hotelfassade: Reihen von Düsen, jede ein Spektrumband, Wasser farbig von unten beleuchtet, Gischt als runde Tropfen. Höhe folgt der geglätteten Bandenergie.
4. **MirrorBallRoom** [3D] -- eine echte Spiegelkugel dreht über einem leeren Ballsaal, tausende Lichtpunkte wandern über Wände, Boden und Säulen; Kick = Helligkeit der Spots, Tonklasse = Farbe.
5. **KineticBallCeiling** [3D] -- eine Decke aus 700 hängenden Metallkugeln, die fließende Wellenflächen bilden (Kinetik-Skulptur). Die Fläche ist eine langsame Überlagerung geglätteter Bänder; die Kugeln spiegeln das Foto.
6. **LEDRainCurtain** [3D] -- ein Vorhang aus fallenden Lichtstäben im Nebel, von vorn, bildfüllend; jede Spalte eine Tonklasse, Tropfenhelligkeit = Energie.
7. **ProjectionMappedFacade** [2D] -- eine barocke Fassade bei Nacht, auf die das Foto projiziert wird; das Relief bricht die Projektion, Licht läuft über Säulen und Gesimse.
8. **NeonSignAlley** [2D] -- eine enge Gasse mit hunderten Neonschildern in die Tiefe, Regen, nasse Pflastersteine, langsames Gleiten; Bänder = Schildhelligkeit.
9. **HologramGauze** [2D] -- Pepper's-Ghost-Gaze vor einer dunklen Bühne, darauf eine riesige schwebende Lichtfigur aus dem Foto, Publikum als Silhouetten.
10. **FiberOpticChandelier** [3D] -- ein gewaltiger Glasfaser-Kronleuchter von unten gesehen, Lichtpulse laufen durch tausende Stränge, Spitzen leuchten in der Tonklasse.

## B. Architektur von innen

11. **BasilicaCisternColumns** [3D] -- eine versunkene Zisterne: Säulenwald bis zum Horizont, rötlich angestrahlt, gespiegelt im schwarzen Wasser, Tropfen ziehen Ringe.
12. **ChandBaoriStepwell** [2D] -- ein indischer Stufenbrunnen von oben: tausende Treppen im Zickzack zu grünem Wasser, harte Schatten; das Licht wandert mit dem Swell.
13. **SagradaForestNave** [3D] -- ein Kirchenschiff aus verzweigten Baumsäulen, bunte Fenster werfen Farbflächen in den Dunst; jede Fensterfarbe ein Band.
14. **MuqarnasDome** [2D] -- Blick senkrecht in eine Muqarnas-Kuppel: tausende Zellen in Rotation um die Mitte (stetig), Goldkanten glühen mit den Bändern.
15. **PantheonOculusShaft** [3D] -- der Lichtschacht durch das Oculus als massive Säule aus Licht und Staub, wandernd über die Kassetten.
16. **CalatravaRibsHall** [3D] -- eine weiße Halle aus Rippen (Oculus in New York), Kamera gleitet durch, Rippen leuchten nacheinander in den Bändern.
17. **MonsterBuildingCourtyard** [2D] -- der Hof eines Hongkonger Wohnblocks von unten: tausende Fenster, Klimageräte, Wäsche, ein Himmelsquadrat; Fenster leuchten mit den Bändern.
18. **LibraryOfBabel** [3D] -- endlose sechseckige Bibliotheksräume, Galerien über Galerien, warmes Lampenlicht, Kamera steigt stetig.
19. **FanVaultFlight** [3D] -- unter einem Fächergewölbe (King's College) entlang, die Rippen als Lichtlinien, Kerzen in der Tiefe.
20. **ParametricPavilion** [3D] -- ein weißer, fließender Innenraum im Stil von Zaha Hadid, Licht läuft über die gekrümmten Flächen.
21. **BrutalistAtriumWaterfall** [3D] -- ein Betonatrium mit Wasserfall über alle Etagen, Grünpflanzen, Gegenlicht durch den Sprühnebel.
22. **TempleLanternHall** [3D] -- eine Tempelhalle, deren Decke vollständig aus tausenden gelben Laternen besteht, gespiegelt im polierten Boden.

## C. Landschaft, filmisch

23. **KarstPeaksMist** [2D] -- Kegelberge bei Guilin in Schichten von Nebel, Fluss mit Bambusfloß, Morgenlicht.
24. **SeaStacksFlight** [2D] -- ein Flug zwischen Felsnadeln im Meer bei Sonnenuntergang, Gischt als Dunst, Vögel als runde Punkte.
25. **CloudSeaSummit** [2D] -- über einem Wolkenmeer bei Sonnenaufgang, einzelne Gipfel ragen heraus, Wolken fließen langsam durch die Täler.
26. **WaterfallCurtainRainbow** [2D] -- ein breiter Vorhang-Wasserfall, im Sprühnebel ein stehender Regenbogen; Swell = Sprühdichte.
27. **GrandPrismaticAerial** [2D] -- eine heiße Quelle von oben: konzentrische Ringe von Tiefblau bis Orange, Dampf zieht darüber.
28. **LavenderRowsSunset** [2D] -- Lavendelreihen bis zum Horizont, tiefe Sonne, Zentralperspektive; Bänder = Reihenleuchten.
29. **IceCaveBlueArch** [2D] -- in einer Gletscherhöhle mit leuchtend blauem Eisbogen, Licht vom Eingang.
30. **DesertMilkyWayArch** [2D] -- ein Felsbogen unter der Milchstraße, Sterne rund, Lagerfeuerlicht am Fels.
31. **CanyonRiverGoldenHour** [2D] -- ein Flug durch einen Canyon im goldenen Licht, Fluss als glitzerndes Band.
32. **TulipFieldsAerial** [2D] -- Tulpenfelder von oben als farbige Streifen, die langsam unter der Kamera durchziehen.
33. **DolomitesAlpenglow** [2D] -- Felsgipfel im Alpenglühen, das Glühen steigt und fällt mit dem Swell.
34. **BlackSandBeachWaves** [2D] -- weiße Brandung auf schwarzem Sand von oben, Schaum als Spitze.

## D. Himmel und Wetter

35. **MammatusSunset** [2D] -- beutelförmige Wolkenunterseiten im roten Abendlicht, bildfüllend.
36. **LightPillarsCity** [2D] -- Lichtsäulen über einer Winterstadt, jede Säule eine Tonklasse.
37. **FogbowMoor** [2D] -- ein weißer Nebelbogen über einem Moor.
38. **LenticularCloudStack** [2D] -- linsenförmige Wolkenstapel über einem Berg, rosa beleuchtet.
39. **ThunderstormFromOrbit** [2D] -- Gewitterzellen von oben bei Nacht: Blitze leuchten Wolken von innen, Städte als Lichtnetz darunter. Kick = Blitzlicht.
40. **VirgaCurtains** [2D] -- Regenschleier, die den Boden nicht erreichen, im Gegenlicht.
41. **StarTrailsPolaris** [2D] -- kreisende Sternspuren über einer Landschaft; Rotation stetig, Spurhelligkeit = Bänder.
42. **MoonriseSkyline** [2D] -- ein riesiger aufgehender Mond hinter einer Skyline (Teleobjektiv).
43. **AnticrepuscularRays** [2D] -- Lichtstrahlen, die sich am Gegenpunkt der Sonne treffen, über dem Meer.
44. **ShelfCloudPrairie** [2D] -- eine Böenwalze über flachem Land, Blitze im Inneren.

## E. Wasser und Unterwasser

45. **SunkenLinerShafts** [3D] (Modell) -- ein gesunkener Ozeandampfer, Lichtschächte fallen durch das Wasser auf das Deck.
46. **UnderIceLookingUp** [2D] -- unter dem Eis eines gefrorenen Sees, Risse und Luftblasen gegen das Licht.
47. **WhaleSharkPlankton** [3D] (Modell) -- ein Walhai zieht durch eine leuchtende Planktonwolke.
48. **MantaNightFeeding** [3D] (Modell) -- Mantas kreisen in einem Lichtkegel voller Plankton.
49. **CaveDiversTorches** [2D] -- Taucherlampen tasten eine Unterwasserhöhle ab, die Kegel voller Schwebeteilchen.
50. **AtlantisRuinsCaustics** [3D] -- versunkene Säulen und Tempel im Kaustiklicht, Fischschwärme als Punkte.
51. **RainOnWindowCity** [2D] -- Regentropfen auf einer Scheibe brechen die Stadt dahinter, jeder Tropfen eine Linse.
52. **SurfBarrelInside** [2D] -- im Inneren einer brechenden Welle, Sonne durch die Wellenlippe.
53. **StormLighthouse** [2D] -- ein Leuchtturm in brechender See, der Lichtstrahl dreht stetig.
54. **SeaFoamLaceAerial** [2D] -- Wellen von oben, Schaum als Spitzengewebe auf türkisem Wasser.
55. **CoralSpawningNight** [3D] -- Korallenlaich steigt wie umgekehrter Schnee in rosa Bündeln durch das Taschenlampenlicht.

## F. Natur und Tiere

56. **FlamingoLakeAerial** [2D] -- tausende Flamingos als rosa Muster auf einem roten Salzsee.
57. **BatExodusSunset** [2D] -- Millionen Fledermäuse spiralen aus einer Höhle vor rotem Himmel.
58. **MayflyStreetLamps** [2D] -- Eintagsfliegen-Wolken um Brückenlaternen, jedes Insekt ein runder Lichtpunkt.
59. **KoiPondAbove** [2D] -- Koi in einem Teich von oben, Spiegelung des Himmels, Blätter treiben.
60. **WildebeestDust** [2D] -- eine Herde im Staub bei Gegenlicht, Silhouetten.
61. **NaicaSelenitePillars** [3D] -- riesige Selenitkristalle in einer Höhle, Stirnlampenlicht.
62. **FireflyForestSync** [2D] -- ein Wald, in dem Glühwürmchen in Wellen synchron blinken.
63. **ButterflyWingScales** [2D] -- Flug über Schmetterlingsflügel-Schuppen im Makro, schillernd.
64. **PolarBearAurora** [3D] (Modell) -- Eisbär auf dem Packeis unter Polarlicht.

## G. Stadt und Nacht

65. **NightTrainMountains** [3D] -- ein beleuchteter Zug durch verschneite Berge, Fenster als Lichtband.
66. **HarbourCranesNight** [3D] -- Containerhafen bei Nacht, Kräne mit Lichtern, Spiegelungen im Wasser.
67. **RunwayApproachLights** [2D] -- der Landeanflug bei Nacht, Anflugbefeuerung läuft auf die Kamera zu.
68. **InterchangeLightTrails** [2D] -- ein Autobahnkreuz von oben in Langzeitbelichtung, Lichtströme.
69. **BlueHourSkylineMirror** [2D] -- eine Skyline zur blauen Stunde, gespiegelt im Fluss.
70. **FogBridgeTowers** [2D] -- Brückentürme ragen aus einer Nebeldecke.
71. **NighthawksDiner** [2D] -- ein Diner bei Nacht im Stil von Edward Hopper, Neonlicht auf leerer Straße.
72. **RooftopRainTokyo** [2D] -- Dächer im Regen, Leuchtreklamen spiegeln sich auf nassen Flächen.
73. **StadiumFloodlights** [2D] -- Flutlichtmasten in Nebel und Regen, Lichtkegel.

## H. Material und Makro

74. **HoliColourCloud** [2D] -- Farbpulverwolken explodieren in Zeitlupe gegen Gegenlicht.
75. **PaintPourCells** [2D] -- Acrylfarben-Zellen fließen und öffnen sich.
76. **FrostFernsSunrise** [2D] -- Eisblumen an einer Scheibe, Sonnenaufgang dahinter.
77. **DiamondFireMacro** [2D] -- ein Diamant im Makro, Dispersionsfeuer in allen Farben.
78. **UVMineralsGlow** [2D] -- Mineralien unter UV-Licht, leuchtend grün, rot, blau.
79. **GemInclusionFlight** [2D] -- Flug durch einen Smaragd mit Einschlüssen.
80. **MarbleVeinsFlight** [2D] -- Flug über poliertes Marmor mit Goldadern.
81. **SmokeColourCollide** [2D] -- zwei farbige Rauchströme prallen in Schwarz aufeinander.
82. **IrisMacro** [2D] -- eine Iris im Makro, das Foto als Irismuster, Pupille atmet mit dem Swell.
83. **MilkCrownSplash** [2D] -- ein Kronenspritzer in Zeitlupe, endlos.
84. **SpeakerConeWaterDance** [2D] -- Wasser auf einer Lautsprechermembran bildet Muster (echte Resonanz).

## I. Malerei und Kunststile

85. **StarryNightFlow** [2D] -- Pinselströme im Stil von Van Gogh fließen über das Foto.
86. **KlimtGoldMosaic** [2D] -- Goldmosaik mit Spiralen, das Foto als Figur darin.
87. **MonetLilyPond** [2D] -- Seerosen in Monet-Pinselstrichen, Spiegelung.
88. **TurnerStormHaze** [2D] -- Sturm, Licht und Dunst im Stil von Turner.
89. **SeuratPointillism** [2D] -- das Foto aus runden Farbpunkten.
90. **ShanShuiScroll** [2D] -- chinesische Tuschlandschaft, Rolle zieht vorbei.
91. **ArtNouveauWhiplash** [2D] -- Jugendstil-Peitschenhieblinien, Ornamente wachsen stetig.
92. **PapelPicadoBanners** [2D] -- mexikanische Papierbanner flattern gegen Himmel.
93. **AboriginalDotDreaming** [2D] -- Punktmalerei in Ringen und Spuren.
94. **ShinkaiSkyClouds** [2D] -- Anime-Himmel mit Wolkentürmen und Lens-Flares.
95. **CubistFacets** [2D] -- das Foto in kubistische Flächen zerlegt.
96. **RothkoFields** [2D] -- große atmende Farbfelder, ruhig.

## J. Abstrakt und Club

97. **DiscoFloorTiles** [3D] -- ein leuchtender Tanzboden von schräg oben, jede Kachel ein Band, das Licht spiegelt sich in einer Spiegeldecke darüber; Kick = Kachelblitz, nichts bewegt sich.
98. **LaserMappedForest** [2D] -- grüne Laserebenen schneiden durch einen nebligen Wald; wo sie Stämme treffen, entstehen leuchtende Konturen. Die Ebenen gleiten stetig, die Bänder färben sie.
99. **NeonPoolNight** [2D] -- ein leeres Schwimmbad bei Nacht von oben, Unterwasser-Neon, Kaustik auf Wänden und Fliesen; Bass = Wellengang des Lichts.
100. **OpArtRileyWaves** [2D] -- Streifenfelder wie bei Bridget Riley, die sich zu Wellen biegen, bildfüllend, Schwarzweiß mit Farbakzent aus dem Foto.
101. **RibbonGymnasticsNeon** [2D] -- Neonbänder ziehen Schleifen und Spiralen durch einen dunklen Raum wie beim Rhythmischen Turnen, die Spuren bleiben kurz stehen.
102. **TeslaCoilConcert** [2D] -- zwei singende Teslaspulen auf einer Bühne, die Entladungen folgen den Tönen (Licht, nicht Bewegung), Faraday-Käfig im Vordergrund.
103. **NeonReedForest** [3D] -- ein Feld aus hunderten senkrechten Neonröhren im Nebel wie Schilf, jede Röhre eine Tonklasse, langsamer Flug hindurch.
104. **UVBlacklightPaint** [2D] -- fluoreszierende Farbspritzer und Läufe an dunklen Wänden unter Schwarzlicht, in der Tiefe eines Raums.

## K. Kosmos, neu gesehen

105. **CometOverLake** [2D] -- ein Komet über einem Bergsee, gespiegelt.
106. **EarthriseLunar** [2D] -- Erdaufgang über dem Mondhorizont.
107. **JupiterJunoSwirls** [2D] -- Jupiters Wirbel wie in den Juno-Bildern, bildfüllend.
108. **MarsBlueSunset** [2D] -- blauer Sonnenuntergang auf dem Mars.
109. **BloodMoonRise** [2D] -- eine Blutmond-Finsternis über Landschaft.
110. **ISSCupolaEarth** [3D] -- Blick aus der Cupola, die Erde zieht vorbei.
111. **AuroraFromOrbit** [2D] -- Polarlicht von oben als grüne Bänder.
112. **ZodiacalLightDesert** [2D] -- Zodiakallicht über einer Wüste.

## L. Kultur und Feste

113. **TaikoSilhouettes** [2D] -- Taiko-Trommler als Silhouetten, der Kick als Lichtschlag.
114. **WhirlingDervishes** [2D] -- Derwische in Langzeitbelichtung, Röcke als Scheiben.
115. **DragonLanternParade** [3D] -- ein Laternendrache zieht durch eine Gasse.
116. **DroneSwarmCloud** [3D] -- ein Drohnenschwarm als schwebende Lichtwolke, ohne Figuren.
117. **KecakFireCircle** [2D] -- Tänzer im Feuerkreis.
118. **DiwaliRiverLamps** [2D] -- Öllampen treiben auf einem Fluss.

## M. Ergänzungen

119. **SteamLocomotiveNight** [3D] (Modell) -- eine Dampflok bei Nacht auf einem Viadukt, Dampf im Scheinwerferlicht, Funken aus dem Schornstein als runde Punkte.
120. **ForestCanopyLookingUp** [2D] -- senkrechter Blick in ein Blätterdach, Kronen mit Schüchternheitsspalten, Sonnensterne dazwischen.
121. **RapeseedStormLight** [2D] -- gelbe Rapsfelder unter schwarzem Gewitterhimmel, ein einzelner Sonnenfleck wandert darüber.
122. **GlacierLagoonIcebergs** [2D] -- treibende Eisberge in einer Lagune bei Mitternachtssonne, gespiegelt.
123. **OperaHouseSails** [3D] (Modell) -- die Segelschalen eines Opernhauses bei Nacht, farbig angestrahlt, Hafenwasser davor.
124. **GrandCanalLights** [2D] -- ein venezianischer Kanal bei Nacht, Laternen und Fenster spiegeln sich im Wasser.
125. **PetraSiqCandles** [2D] -- eine Felsfassade am Ende einer Schlucht bei Nacht, davor hunderte Kerzen am Boden.
126. **SkyscrapersAboveClouds** [2D] -- Hochhausspitzen ragen bei Sonnenaufgang aus einer Wolkendecke.
127. **IceHotelHall** [3D] -- eine geschnitzte Eishalle, blau und violett durchleuchtet, Säulen und Bögen aus Eis.
128. **SaltMineChapel** [3D] -- eine unterirdische Kapelle aus Salz mit Kristallleuchtern.
129. **WisteriaTunnelNight** [2D] -- ein Tunnel aus hängenden Glyzinien bei Nacht, von unten beleuchtet.
130. **NorthernCityHarbour** [2D] -- ein nordischer Hafen mit bunten Holzhäusern im Winterlicht, Schnee auf den Dächern.
