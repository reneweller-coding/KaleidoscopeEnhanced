# -*- coding: utf-8 -*-
"""Regenerate the genre presets (and the one Test preset) from Komplett.xml.

Komplett.xml is the master list: every scene and FX entry lives there with
its mood tags, formulas and parameter ranges.  This tool filters that master
by mood into the genre configurations, so adding a scene to Komplett (with
moods) and re-running this script is all it takes to roll it out everywhere.

    python Tools/make_genre_configs.py          (run from the repo root)

Genres. SCENES of the six genre presets are chosen by rated fit
(Tools/preset_fit.tsv, see select_by_fit below): at least 400 distinct scenes
each, best fit first, dull ones last. The mood rules below still pick the FX
overlays and transitions, and the scenes nobody has rated yet:
    Ambient      calm or dreamy, never aggressive
    SpaceAmbient the hand-curated `space` tag: ships, worlds, deep sky --
                 long scene times and long crossfades (see TIMING)
    Club         aggressive, or bright without calm
    Noir         dark
    Psychedelic  psychedelic
    Galerie      calm/bright/dreamy, never aggressive or psychedelic
    Allround     everything, every model variant
    TestAlle     the review bench, hidden. Everything, but deliberately NOT a
                 show: FxPlain as the only overlay and Crossfade as the only
                 transition, so nothing is ever painted over the scene being
                 judged, and its own silent audio file so two runs of the same
                 shader look alike. The "Test" name prefix flips the engine
                 into review mode: 2D block then 3D block, alphabetical inside
                 each, a fixed 25 s per scene, 'n' steps onward.
"""
import re, os, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SRC = "Presets/Komplett.xml"
# Relative to the executable's working directory (bin/), exactly like the
# shader paths ("..\\\\Scene2D\\\\X.frag").  The bundled photo library lives in
# Images/ beside Presets/; a user who wants their own pictures sets
# imageDirectory in kaleidoscope_settings.ini instead of editing generated
# files, which this script would overwrite on its next run.
IMAGE_DIR = "..\\\\Images"

# Every rule takes (moods, head): the mood set, and the entry's opening tag.
# Most only need the moods, but "loads a real 3D model" is a property of the
# tag (geom="mesh") and no mood can stand in for it.
def rule_ambient(m, h):     return ("calm" in m or "dreamy" in m) and "aggressive" not in m
def rule_club(m, h):        return "aggressive" in m or ("bright" in m and "calm" not in m)
def rule_noir(m, h):        return "dark" in m
def rule_psychedelic(m, h): return "psychedelic" in m
def rule_galerie(m, h):     return (("calm" in m or "bright" in m or "dreamy" in m)
                                    and "aggressive" not in m and "psychedelic" not in m)
def rule_all(m, h):         return True
# Preset-only tag, curated by hand in Komplett.xml: cosmic subject AND a
# slow character.  Deliberately NOT derived from calm/dreamy -- plenty of
# calm scenes are not space, and a few space ones (a black hole) are not
# calm but belong in the mood anyway -- as long as they are not aggressive.
# Not aggressive (14.09.2026): 59 of 257 space entries were -- a gamma-ray
# burst, a planetary collision, a racing flight -- and a calm space preset
# is exactly where they do not fit.
def rule_space(m, h):       return "space" in m and "aggressive" not in m

# Preset-wide timing overrides (seconds): solo min/max, crossfade min/max.
# Absent = the engine's own 20..90 s scene / 15 s fade baseline.
# These four numbers are the PHOTO pacing -- background-image solo min/max and
# cross-fade min/max, in seconds. They are NOT the scene times: those live on
# the individual entries (minTimeSolo/maxTimeSolo), and the review bench's 8 s
# comes from review mode in the scheduler, full stop. An earlier revision set
# TestAlle to (8, 9, 1, 2) here in the belief it was stating the scene time in
# the file -- what it actually did was rotate the background photograph every
# 8-9 s with a snappy 1-2 s fade, downbeat-quantised like the scene changes
# and at nearly their period, so the photo swap drifted onto the seconds right
# AFTER each scene change. The scene's palette and the exposure both follow
# the photograph, so every such swap read as the fresh scene abruptly changing
# brightness -- reported three times before the cause was this line.
TIMING = {
    "SpaceAmbient": (55, 150, 22, 45),
    # Review bench: the photograph must hold still while a scene is judged.
    # 45-60 s solo = one photo lives ~6-7 scenes of the walk; a 15-25 s fade
    # is below the threshold of notice while a scene is on trial.
    "TestAlle":     (45, 60, 15, 25),
    "TestModified": (45, 60, 15, 25),
    "TestNeu": (45, 60, 15, 25),
    "TestAufgemoebelt": (45, 60, 15, 25),
}

# Floor on every natural scene fade (seconds), written as timeSceneFadeMin.
# With a beat in the music the scheduler clamps fades to four beats (2 s at
# 120 BPM), which is right for a club preset and wrong for a calm one: the
# user found transitions "very, very fast" in Ambient and SpaceAmbient
# (14.09.2026). A preset with a floor also never hard-cuts on a drop.
SCENE_FADE_MIN = {
    "Ambient": 5,
    "SpaceAmbient": 6,
}

# The review preset analyses this instead of listening. Relative to the exe's
# working directory, like every other path here. Live audio would make a scene
# look different on every pass, which is the one thing a review must not do --
# and offline analysis is silent, so nothing comes out of the speakers.
#
# Which file is not a detail. The first bench track (broadband120.wav, still
# used by the UI smoke test) is a drone the engine reads as CALM -- arousal
# 0.05, ambient up to 0.62 -- and the catalogue answers a calm track by dimming
# itself. Measured over an identical 99-scene sweep, review128 is worth a
# median frame luminance of 0.338 against 0.282, and 4% near-black frames
# against 7%. Tools/make_test_song.py builds it and says why it sounds as it
# does.
REVIEW_AUDIO = "..%sTools%sreview128.wav" % ("\\\\", "\\\\")

# A preset that exists to be LOOKED AT: no overlay may paint over the scene
# under review, and no transition may dress up the cut.
REVIEW_ONLY_FX = {"FxPlain"}
REVIEW_ONLY_TRANS = {"Crossfade"}

# Every scene reworked since 252510f: the two user-feedback batches of
# 2026-08-30/31 plus the ones the catalogue-wide screening turned up on its
# own. TestModified collects exactly them as a hidden review bench so the
# fixes can be judged in sequence instead of waiting for them to come round.
# Selection is BY NAME, not by mood -- the set is a historical fact, not a
# property of the scenes, so it is listed rather than derived.
MODIFIED_SCENES = {
    "AbandonedStarGate", "AbyssalLuminescence",
    "AizawaAttractorSphereVortex", "AlcubierreWarpDriveHighway",
    "AlienPlanetOrbit", "AnamorphicMirrorLabyrinth", "AntimatterWeapon",
    "ApollonianSpherePackingDive", "ApollonianSpherePackingGasket",
    "AtmosphericEntry", "AuroraBorealisCurtainFlight", "BeyondTheEdge",
    "BinaryStarSystem", "BioCellularInfiniteZoom",
    "BioLuminescentTendrilTunnel", "BioNeuralDendriteZoom",
    "BioluminescentDeepSeaCombJelly", "BioluminescentDeepSeaTrenchDive",
    "BioluminescentNebula", "BismuthLabyrinth", "Bubble",
    "BuddhabrotCosmicGhost", "BurningShipDeepVoyage",
    "CalabiYauManifoldKaleido", "CausticPool",
    "CelticMandelbrotGothicVault", "ChiralNematicLiquidCrystal",
    "CliffordAttractorSilkRibbons", "CliffordTorusKleinBottle",
    "CliffordTorusStereographicKaleido", "CollatzFractalTreeAbyss",
    "ConformalLogPolarDive", "CryosleepChamber", "CrystalAsteroidField",
    "CrystalGeodeCavernFlight", "CrystalMirrorGrid", "CyberGridCity",
    "CyberHologramGlitchVoxel", "CyberpunkSynthGridHighwayFly",
    "CyberpunkWireframeTerrainFlyover", "CyborgHiveShip",
    "DerelictMothership", "DichroicInfinityPrismVault",
    "DichroicPrismLaserField", "DysonSphereCollapse", "DysonSphereCore",
    "EinsteinRingGravitationalLens", "EndOfTheUniverse", "EventHorizon",
    "EventHorizonSingularityPlunge", "ExoplanetOcean", "ExoplanetRings",
    "FerroSpikes", "FerrofluidMagneticSpikeSurge",
    "FerrohydrodynamicRosensweigSpikes", "FluidChladniKaleidoResonance",
    "FluidChromaMarangoniConvection", "FractalKIFS",
    "FractalPortalRecursionHall", "FrozenMethaneLakes",
    "FuturisticCityFlight", "GalacticAccretionStreamFlight",
    "GalacticCoreBlackHole", "GammaRayBurst", "GasGiantAtmosphere",
    "GasGiantCloudCity", "GlitchMatrixHypercube",
    "GyroidTriplyPeriodicLabyrinth", "GyroidalInterferenceKaleido",
    "HigherDimensionAscension", "HilbertSpaceFillingCurveZoom",
    "HolographicDiffractionGratingMandala", "HopfFibrationStreamlines",
    "HyperDimensionalTesseractTunnel", "HyperToroidalRollerCoaster",
    "HyperbolicEscherCircleLimit", "HyperbolicHoneycombTessellation",
    "HyperbolicKnotFlight", "HyperbolicPenroseZoomAbyss",
    "HyperbolicTilingPolyhedralFlight", "HyperlaneJunction",
    "HyperspaceGridToroidTube", "HyperspaceKaleidoscopicMatrix", "IceCrack",
    "InfinitePsychedelicDrosteVortex", "InterstellarNebulaWarpCruise",
    "KaleidoscopicBismuthLattice", "KaleidoscopicLichtenbergZoom",
    "KardashevTypeIIICity", "KleinBottleHyperLoopDive",
    "KleinQuarticHyperbolicCurve", "KleinianLimitSetAbyss",
    "LaserCavityTransverseModes", "LavaWorldTidalLock",
    "LiesegangPrecipitationRingArray", "LiquidChromeHyperSwirl",
    "LiquidMarbleEbruAcidWash", "LiquidMetal",
    "LogarithmicSpiralChamberZoom", "LorenzAttractorHyperLoom",
    "LyapunovSpaceBioLoom", "MandelboxHyperCubeMetamaterial",
    "MandelbulbInfiniteDive", "MatrioshkaBrain", "MolecularCloudCore",
    "MultiverseBubbles", "NebulaCliffs", "NebulaShipyard",
    "NeonCyberVoxelFlight", "NestedMandalaInfiniteDive",
    "NeutronStarCollision", "NeutronStarMagneticFunnelPlunge",
    "NewtonBasinPsychedelicSea", "NonEuclideanOctahedralLabyrinth",
    "NonlinearSchrodingerRogueWave", "OctagrammicMirrorVault",
    "OpticalDispersionCausticVault", "PillarsOfCreationFlight",
    "PlanetaryCollision", "PlanetaryRingRings", "PrismaticCrystalChamber",
    "PrismaticCrystalChamber4D", "PrismaticLaserVault",
    "PrismaticMirrorHexTunnel", "PrismaticRainbowCloud",
    "PsychedelicReactionDiffusionWave", "QuantumChromodynamicFluxTube",
    "QuantumHallSkyrmionCrystal", "QuantumSlipstream",
    "QuantumTachyonWarpTunnel", "QuantumWavepacketSuperposition",
    "QuantumWormholeFlythrough", "QuasiPeriodicDanzerTiling",
    "QuasicrystalPenroseKaleido", "QuaternionFractalHopfLoom",
    "QuaternionicJulia4DFlight", "RecursiveTesseractWireframeZoom",
    "RelativisticKerrPlasmaDisk", "RiemannSphereInfinityFlight",
    "RingworldHabitat", "RogueWanderer", "RosslerAttractorHyperRibbon",
    "SacredGeometryFlowerOfLife3D", "SierpinskiOctahedronAbyss",
    "SolarFlareCorona", "SolarFlareSurfing", "SolarMagnetoPlasmaLoop",
    "SpaceElevatorTransit", "SpaceStationPromenade", "StarShattering",
    "StarshipPlanetaryOrbit", "StellarEngine", "StellarNursery",
    "SuperfluidQuantumTurbulence", "SupermassiveAccretionDisk",
    "TheBigBounce", "ThomasAttractorCosmicLabyrinth",
    "TricornFractalAntimatterSea", "VillarceauCirclesHyperFlow",
    "VoidLeviathan", "VolcanicLightningPlume", "VoronoiPrismShatterKaleido",
    "WhiteDwarfAccretion", "XenobiologicalBioship",
}
# Die Szenen, die in v1.11.0 und v1.11.1 repariert wurden -- eine kurze Runde
# zum Gegenpruefen (neun Szenen statt der 164 in TestModified, also gut vier
# Minuten statt siebzig).  Bewusst eine eigene Liste: welche Szenen zuletzt
# dran waren, ist eine historische Tatsache und soll im Diff stehen.
RECENT_SCENES = {
    # 29.09.: die Schauwert-Szenen (docs/proposals-2026-09-29-schauwert.md),
    # Block 1 und 2 -- zum Durchsehen am Stueck.
    "NeonSignAlley", "SolidLightCones", "MuqarnasDome", "CloudSeaSummit",
    "WaterfallCurtainRainbow", "ThunderstormFromOrbit", "StormLighthouse",
    "RainOnWindowCity", "StarryNightFlow", "KlimtGoldMosaic",
    "BasilicaCisternColumns", "TempleLanternHall", "MirrorBallRoom",
    "MusicalFountainShow", "DiscoFloorTiles", "HoliColourCloud",
    "JupiterJunoSwirls", "DiamondFireMacro", "WhirlingDervishes", "KoiPondAbove",
    # Block 3 (29.09. abends).
    "KarstPeaksMist", "SeaStacksFlight", "IceCaveBlueArch", "DesertMilkyWayArch",
    "LightPillarsCity",
    "BlueHourSkylineMirror", "PaintPourCells", "MonetLilyPond", "NeonPoolNight", "CometOverLake",
    "NighthawksDiner", "FrostFernsSunrise", "EarthriseLunar", "TaikoSilhouettes", "RapeseedStormLight",
    "WeatherProjectSun", "KineticBallCeiling", "LEDRainCurtain", "ProjectionMappedFacade", "HologramGauze",
    "FiberOpticChandelier", "ChandBaoriStepwell", "SagradaForestNave", "PantheonOculusShaft", "CalatravaRibsHall",
    "MonsterBuildingCourtyard", "LibraryOfBabel", "FanVaultFlight", "ParametricPavilion", "BrutalistAtriumWaterfall",
    "GrandPrismaticAerial", "LavenderRowsSunset", "CanyonRiverGoldenHour", "TulipFieldsAerial", "DolomitesAlpenglow",
    "BlackSandBeachWaves", "MammatusSunset", "FogbowMoor", "LenticularCloudStack", "VirgaCurtains",
    "StarTrailsPolaris", "MoonriseSkyline", "AnticrepuscularRays", "ShelfCloudPrairie", "UnderIceLookingUp",
    "CaveDiversTorches", "SurfBarrelInside", "SeaFoamLaceAerial", "FlamingoLakeAerial", "BatExodusSunset",
    "MayflyStreetLamps", "WildebeestDust", "FireflyForestSync", "ButterflyWingScales", "RunwayApproachLights",
    "InterchangeLightTrails", "FogBridgeTowers", "RooftopRainTokyo", "StadiumFloodlights", "UVMineralsGlow",
    "GemInclusionFlight", "MarbleVeinsFlight", "SmokeColourCollide",
    "TextureBoreTunnel", "TextureNeonTrace", "TextureLavaCracks", "TextureMaelstrom", "WallpaperGroupCycle", "OilProjector",
    "LavaLamp", "TextureFlowParticles", "SchillerOverTexture", "DewdropLensArray", "TextureSequinField",
    "TextureAuroraField", "TextureNebulaVolume", "RichterSqueegee", "RheoscopicSwirl",
    "ActiveNematicDefects", "LiquidLightShow", "TextureCausticCeiling", "TextureLanternField", "TextureCloudInterior",
    "TextureLanternTunnel", "CurvedMirrorKaleido", "TextureMirrorSeamsWander",
    "TextureGeodeInterior", "TextureHoloFoil", "AlcoholInkBlooms",
    "TruchetFlowWeave", "OilDropsOnWater", "TextureStainedGlassField",
    "ThinSectionPolarized", "TurnerVortex", "NeonRingTunnel",
    "SoulagesOutrenoir", "TwinHelixTunnel", "WindMapStreamlines",
    "ParticleLifeClusters", "SymmetryBreathing",
    "TextureEmberBed", "TextureGlowingIce", "TextureGlassCubeSwarm",
    "LouisVeilPours", "HoneyFold", "PointillistDots",
    "DoubleMirrorWave", "TextureAccretionStreams", "TextureSpillBloom",
    "TextureLightningPaths", "TextureCircuitGlow",
    "TextureOrbifoldFlow", "TextureLavaFieldTop", "TextureFireflyGathering",
    "DropCoalescence", "TextureUVBlacklight", "FidenzaStrokes",
    "TextureSquareShaft", "WaxDripCascade", "KusamaDotInfinity",
    "TextureIrisShutter", "TextureNacreSheen", "ZaoWouKiStorm",
    "TextureTubeBundle", "TextureSmokeChamber", "CirclePackingBloom",
    "TextureConformalMorph", "TextureOpalFire", "InkDropsFalling",
    "SpiralStairWell", "TextureSandRipples", "TextureBioluminescentField",
    "TextureThinFilmSoap", "TextureCityLightsOrbit", "TextureFrostCreep",
    "StandingWaveTunnel", "TextureP6Crystal", "MilkDyeBurst",
    "TextureOpWaves", "TextureRiverDelta", "TextureLatticeTunnel",
    "TextureRibbonVortex", "TextureMarbleFlow", "TextureGlowVines",
    "TextureFlowerThroat", "TextureIronFilings", "BubbleOilLamp",
    "TextureSuminagashiDrops", "TextureTelescopeRings", "TextureDelaunayLightNet",
    "TexturePineConeSpirals", "TexturePinArt", "TextureGirihChambers",
    "DelaunayDiscs", "TextureLightShafts", "MatisseCutouts",
    "AfKlintSpirals", "TextureCrackleGlaze", "TextureAnodizeRainbow",
    "SpiralPhoto", "CrossHatchPhoto", "RecursiveRectSubdivision",
    "TextureWaterSurfaceLookUp", "TextureGlassBlocksWall", "FoamCoarsening",
    "TextureGasGiantDive", "TextureIceFloes", "WeatherRadarSweep",
    "KuramotoRings", "TextureMicroscopeSlide", "TextureMitosisField",
    "TextureFlipDisc", "TextureRippleInterference", "TextureHeatGlowMetal",
    "WaterfallTunnel", "DoyleSpiralTexture", "TextureFanFold",
    "StarStreakTunnel", "TextureTumblingBlocks", "PhotoWovenThreads",
    "PolarRippleTunnel", "TextureCoilSpring", "TextureBokehStreams",
    "TextureInfiniteRosettes", "TextureAdvectionSilk", "TextureNeonRain",
    "TextureContourNeonMap", "TextureFireFront",
    "TextureMoldBloom", "TextureGoboWash", "TexturePhosphorTrails",
    "TextureFiberOptic", "PollockDripField", "FrankenthalerSoakStain",
    "SumiEnsoField", "KleinBlueSponge", "KandinskyField",
    "ImpressionistDabs", "TextureChatoyance", "TextureAmberSubsurface",
    "TextureRingFlight", "TextureShardCloud", "TextureDichroicCoat",
    "TextureCrystalLatticeFlight", "TextureSilkVeils", "TextureCometShower",
    "TextureLeafStorm", "TextureChainCurtains", "TextureConfettiVolume",
    "TextureBurrow", "TextureVortexCloud", "TextureForkingTunnel",
    "VaultShaftUp", "TextureGlideReflection", "TextureDustMotes",
}

def rule_recent(m, h):
    fm = re.search(r'file="[^"]*[\\/](\w+)\.frag"', h)
    return bool(fm) and fm.group(1) in RECENT_SCENES

# The dull scenes reworked from 29.09.2026 on ("aufmoebeln"), round by round:
# a hidden bench to judge them before and after, in one sitting.
IMPROVED_SCENES = {
    # Runde 1: die Szenen mit Schauwert 1 (TestNiedrigerSchauwert).
    "AlienPlanetOrbit", "TricornFractalAntimatterSea", "SupernovaRemnant",
    "RingworldHabitat", "GasGiantAtmosphere", "SolitonInternalWaveAndamanSea",
    "MolecularCloudCore", "TerraformingColony", "EndOfTheUniverse",
    "ErodedLand", "HilbertSpaceFillingCurveZoom", "InkTank",
    "AttentionHeadRibbons",
    # Runde 2: Schauwert 2 und AsteroidMiningBase (jetzt 2D statt Wuerfel).
    "AsteroidMiningBase", "NebulaCliffs", "StellarNursery", "DarkMatterWeb",
    "KardashevTypeIIICity", "IcebergWaterline", "PlanetaryRingRings",
    "MatrioshkaBrain", "DerelictMothership", "SectionStrataCanyon",
    "RecursiveHexagonHoneycombZoom", "SlotMachineReels", "SpirographGearDraw",
    "LenticularFlip", "BuildUpAvalanche", "TemporalZoomSSM",
    "SupercellMesocyclone",
    # Runde 3: restliche Schauwert-2-Szenen; die sechs 3D-Szenen sind jetzt 2D.
    "BobbinLacePillow", "CherryBlossomFront", "DoubleSlitElectronBuildup",
    "FrescoRestorationReveal", "DielectricMetasurfaceHologram", "MelodyScript",
    "PenguinHuddleRotation", "RiceTerracesDawn", "SeifertSurfaceBraidKnot",
    "SelfSimilarityTerrain",
    # Runde 4: die letzten beiden Schauwert-2-Szenen, beide jetzt 2D.
    "GlassStack", "LanternRise",
}

def rule_improved(m, h):
    fm = re.search(r'file="[^"]*[\\/](\w+)\.frag"', h)
    return bool(fm) and fm.group(1) in IMPROVED_SCENES

# The scenes no genre preset took (29.09.2026): with the fit-based choice they
# are, almost to a scene, the ones rated dull -- near-black frames and slow
# staged objects. They stay in Allround; this hidden bench collects them so
# they can be judged one by one (keep, fix, or retire). Filled while the
# genre presets are generated, so it must come after them in GENRES.
GENRE_CHOSEN = set()

def rule_low_interest(m, h):
    fm = re.search(r'file="[^"]*[\\/](\w+)\.frag"', h)
    return bool(fm) and fm.group(1) not in GENRE_CHOSEN

def rule_modified(m, h):
    fm = re.search(r'file="[^"]*[\\/](\w+)\.frag"', h)
    return bool(fm) and fm.group(1) in MODIFIED_SCENES

# (name, scene rule, hidden [, FX/transition rule])
# SpaceAmbient selects its SCENES by the curated `space` tag, but no FX or
# transition carries that tag -- filtering overlays by it would leave the
# preset with FxPlain and Crossfade alone.  Its overlays therefore use the
# ambient rule: calm or dreamy, never aggressive.
GENRES = [
    ("Ambient",     rule_ambient,     False),
    ("Club",        rule_club,        False),
    ("Noir",        rule_noir,        False),
    ("Psychedelic", rule_psychedelic, False),
    ("Galerie",     rule_galerie,     False),
    ("SpaceAmbient", rule_space,      False, rule_ambient),
    ("Allround",    rule_all,         False),
    ("TestAlle",    rule_all,         True),
    ("TestModified", rule_modified,   True),
    ("TestNeu",      rule_recent,     True),
    ("TestAufgemoebelt", rule_improved, True),
    ("TestNiedrigerSchauwert", rule_low_interest, True),
]

src = open(SRC, encoding="utf-8").read()

# Whole entry blocks (open tag .. matching close tag): scenes, FX overlays
# and scene transitions alike.
BLOCK = re.compile(
    r"[ \t]*<(TextureShader|CombineShader|TransitionShader)\b[^>]*>.*?</\1>[ \t]*\n",
    re.S)
blocks = []
for m in BLOCK.finditer(src):
    tag = m.group(1)
    head = m.group(0).split(">", 1)[0]
    mm = re.search(r'mood="([^"]*)"', head)
    moods = set(t.strip() for t in mm.group(1).split(",")) if mm else set()
    fm = re.search(r'file="[^"]*[\\/](\w+)\.(?:frag)"', head)
    name = fm.group(1) if fm else "?"
    blocks.append((tag, name, moods, m.group(0), head))

scenes = [b for b in blocks if b[0] == "TextureShader"]
fx     = [b for b in blocks if b[0] == "CombineShader"]
trans  = [b for b in blocks if b[0] == "TransitionShader"]
print("master: %d scenes, %d fx, %d transitions" % (len(scenes), len(fx), len(trans)))

# The two untagged workhorses must survive every mood filter: FxPlain is the
# resident pass-through overlay, Crossfade the fallback transition — a genre
# preset without either would break the 90%-Plain calibration (or fall back
# to the engine's built-in warning path).
ALWAYS = {"FxPlain", "Crossfade"}

# ---- Scene choice by rated fit (29.09.2026) -------------------------------
# The mood rules alone left Club with 372 scenes, Psychedelic with 331 and
# SpaceAmbient with 114 -- and "every preset at least 400 different scenes"
# was the brief. Tools/preset_fit.tsv holds a hand rating of every scene
# (contact sheet of the three catalogue frames + header + measured luma,
# saturation, motion): fit 0..10 per genre preset and a genre-free
# "interest" 0..10 (how spectacular and filmic it is -- slow staged
# object scenes and near-black frames rate low).
#
# Per genre: rank = fit + INTEREST_WEIGHT * (interest - 5) (+ a second
# genre for SpaceAmbient, whose fillers should at least be ambient). Every
# scene ranked >= RANK_TAKE goes in; the rest by rank until MIN_SCENES
# DISTINCT scenes are reached, skipping dull ones (interest <= DULL) as long
# as anything else is left -- a near-black scene with a good fit on paper
# is still a near-black scene. The counts below are distinct shaders, not
# entries: a mesh family registers one entry per model (ShipFlyby 29), so
# at most MAX_VARIANTS of its entries are carried, spread over its models,
# or one family would crowd out everything else.
#
# A scene missing from the table (added after the rating) falls back to
# the mood rule of its genre until someone rates it.
FIT_FILE = "Tools/preset_fit.tsv"
FIT_COLUMN = {"Ambient": "ambient", "SpaceAmbient": "space", "Club": "club",
              "Noir": "noir", "Psychedelic": "psychedelic", "Galerie": "galerie"}
MIN_SCENES = 400
RANK_TAKE = 6.0
FIT_FLOOR = 3          # never fill with a scene rated below this, even short of MIN_SCENES
DULL = 2
INTEREST_WEIGHT = 0.15
SECOND_FIT = {"SpaceAmbient": ("ambient", 0.4)}
MAX_VARIANTS = 6

fit = {}
if os.path.exists(FIT_FILE):
    lines = open(FIT_FILE, encoding="utf-8").read().splitlines()
    head = lines[0].split("\t")
    for ln in lines[1:]:
        if ln.strip():
            v = ln.split("\t")
            fit[v[0]] = {head[i]: int(v[i]) for i in range(1, len(head))}

def select_by_fit(genre, rule):
    col = FIT_COLUMN[genre]
    shaders = []
    for b in scenes:
        if b[1] not in shaders:
            shaders.append(b[1])
    rated = [s for s in shaders if s in fit]
    second = SECOND_FIT.get(genre)
    def rank(s):
        r = fit[s][col] + INTEREST_WEIGHT * (fit[s]["interest"] - 5)
        if second:
            r += second[1] * (fit[s][second[0]] - 5)
        return r
    chosen = {s for s in rated if rank(s) >= RANK_TAKE and fit[s][col] >= FIT_FLOOR
              and fit[s]["interest"] > DULL}
    for dull_ok in (False, True):
        for s in sorted(rated, key=rank, reverse=True):
            if len(chosen) >= MIN_SCENES:
                break
            if fit[s][col] >= FIT_FLOOR and (dull_ok or fit[s]["interest"] > DULL):
                chosen.add(s)
    # Unrated scenes: the old mood rule decides.
    chosen |= {b[1] for b in scenes if b[1] not in fit and rule(b[2], b[4])}
    sel = []
    for s in shaders:
        if s not in chosen:
            continue
        entries = [b for b in scenes if b[1] == s]
        if len(entries) > MAX_VARIANTS:
            n = len(entries)
            entries = [entries[round(i * (n - 1) / (MAX_VARIANTS - 1))] for i in range(MAX_VARIANTS)]
        sel.extend(entries)
    return sel

for entry in GENRES:
    name, rule, hidden = entry[0], entry[1], entry[2]
    fxRule = entry[3] if len(entry) > 3 else rule
    if name in FIT_COLUMN and fit:
        sel_s = select_by_fit(name, rule)
        GENRE_CHOSEN.update(b[1] for b in sel_s)
    else:
        sel_s = [b for b in scenes if rule(b[2], b[4])]
    sel_f = [b for b in fx    if fxRule(b[2], b[4]) or b[1] in ALWAYS]
    sel_t = [b for b in trans if fxRule(b[2], b[4]) or b[1] in ALWAYS]
    review = name.startswith("Test")
    if review:
        # Strip the show back to nothing but the scene itself.
        sel_f = [b for b in sel_f if b[1] in REVIEW_ONLY_FX]
        sel_t = [b for b in sel_t if b[1] in REVIEW_ONLY_TRANS]
        # 2D block, then 3D block, alphabetical inside each -- the same order
        # the engine's review walk uses. The engine sorts for itself; this is
        # so the FILE reads in the order the walk runs.
        sel_s = sorted(sel_s, key=lambda b: ("Scene3D" in b[4], b[1].lower()))
    hid = ' hidden="true"' if hidden else ""
    tim = ""
    if name in TIMING:
        a, bb, c, d = TIMING[name]
        tim = (' timeTextureSoloMin="%d" timeTextureSoloMax="%d"'
               ' timeTextureInterpolationMin="%d" timeTextureInterpolationMax="%d"'
               % (a, bb, c, d))
    if name in SCENE_FADE_MIN:
        tim += ' timeSceneFadeMin="%d"' % SCENE_FADE_MIN[name]
    aud = ' AudioFile="%s"' % REVIEW_AUDIO if review else ""
    out = ['<?xml version="1.0" encoding="utf-8" ?>',
           '<configuration ImageDirectory="%s" ConfigurationName="%s"%s%s%s >'
           % (IMAGE_DIR, name, hid, tim, aud),
           "",
           "  <!-- GENERATED by Tools/make_genre_configs.py from Komplett.xml -->",
           ("  <!-- REVIEW BENCH: %d scenes (2D block, then 3D), FxPlain only, "
            "Crossfade only, own silent audio -->" if review else
            "  <!-- %d scenes + %d FX overlays + %d transitions, filtered by mood tags -->")
           % ((len(sel_s),) if review else (len(sel_s), len(sel_f), len(sel_t))),
           ""]
    for b in sel_s + sel_f + sel_t:
        out.append(b[3].rstrip("\n"))
    out.append("")
    out.append("</configuration>")
    out.append("")
    path = "Presets/%s.xml" % name
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print("%-12s %3d scenes  %2d fx  %2d trans -> %s"
          % (name, len(sel_s), len(sel_f), len(sel_t), path))
