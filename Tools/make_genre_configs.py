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
    # One chain lab walking with the music carries a long stretch on its own.
    "Kettenlabor": (600, 1800, 15, 30),
    # All transform scenes: a named chain gets a normal stretch, a lab (which
    # walks) may stay long -- 90..300 s solo, gentle 6..12 s fades.
    "Transformationen": (90, 300, 6, 12),
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
    "TextureFriezeBands", "TextureCelticKnotwork",
    "TextureRingGears", "TextureSphericalTiling", "TexturePetalFold",
    "TextureTidePools", "TextureGalaxyFlight", "TextureUnderwaterHaze",
    "TextureFloatingLights",
    "TextureStarsFromLight", "TextureSnowVolume", "TextureBubbleColumn",
    "WatercolorWetInWet", "ResinGeodePour",
    "TextureMistLights", "SaltWatercolorBlooms",
    "TextureNeonCalligraphy", "TextureLaserGrid", "TextureAuroraVolume",
    "BoogieWoogieGrid", "KlineBlackStrokes", "TwomblyScribble",
    "HartungScratches", "TextureGoldLeafBurnish",
    "TextureMurmurationShape", "TextureRainTrickle",
    "MitchellStrokes", "TexturePlanktonDrift", "TextureOilSlickSheen",
    "TextureIceGlaze", "TextureMicaGlitter",
    "IkedaDataStreams", "ThermochromicSheet", "HeatHazeOverFlames",
    "SyrupCurtain", "HotWaxBlobsTop", "CaramelBubbling",
    "InkInOilDroplet", "EpoxyWaves", "DyedIceMelt",
    "FlyEyeLensArray", "TextureNewtonRings", "TenPrintMaze",
    "HitomezashiStitch", "ConcentricPhoto", "PhotoLowPolyFacets",
    "StripePhoto", "MarchingSquaresIsobands", "SubstrateCracks",
    "OilWheelMacro", "MeltingCrayonRainbow",
    "TextureChromatographyRings", "TextureBatikCrackle", "CoffeeRingStains",
    "TextureSatelliteClouds", "LiquidMarbleSpheres",
    "CrystalThroatTunnel", "TexturePinwheelTiling", "TextureWeaveSymmetry",
    "TextureTruchetMirror", "TextureFlowFieldHair", "CellophanePolarized",
    "StellaProtractors",
    "SeismicWavefronts",
    "ChainSpiralKaleido", "ChainKaleidoSpiral", "ChainMobiusKaleido", "ChainKaleidoMobius", "ChainInvertFold", "ChainFoldSpiral", "ChainSquareKaleido", "ChainTwirlP4m", "ChainWarpKaleidoSpiral", "ChainSpiralInvertKaleido", "ChainMobiusFoldTwirl", "ChainP4mSpiralKaleidoWarp",
    "ChainTunnelKaleido", "ChainKaleidoTunnel", "ChainTunnelHex", "ChainHexTunnel", "ChainExpKaleido", "ChainSinFold", "ChainDrosteKaleido", "ChainRippleHex", "ChainTunnelLens", "ChainPolarKaleidoWave", "ChainMirrorTunnelSpiral", "ChainWaveDrosteHex",
    "Chain3DKifsTetra", "Chain3DMandelbox", "Chain3DOctaGyroid", "Chain3DPolarTunnelBoxes", "Chain3DTwistTorus",
    "ChainLab2D", "ChainLab3D", "ChainSlice3D",
    "ChainLabTunnel",
    "PenroseParquet",
    "TruchetMaze",
    "ChainCurlFarris", "ChainWarpQuasi", "ChainTaylorHex", "ChainGerstnerJacobi", "ChainBillowPenrose", "ChainConvectionSierpinski", "ChainGyreSquareWave", "ChainTriangleStreet", "ChainWeierstrassWarp", "ChainInterferenceKoch", "ChainCurlAmmann", "ChainSquareChirikov",
    "NoirBlindsLight", "NoirSmokeBacklight", "NoirKaleidoscope", "NoirTunnel", "NoirSearchlights", "NoirSilverFlow",
    "CyclicAutomatonSpirals",
    "GreenbergHastingsWaves", "LangtonTurmiteHighways", "ElementaryRuleTapestry", "WireworldCircuitry", "BriansBrainStorm", "LifeRuleMorph", "SandpileIdentityMandala", "MargolusBilliardGas", "ForestFireCriticality", "QuantumWalkCones", "KPZGrowthFronts", "RotorRouterAggregate", "TilingSubstitutionAutomaton",
    "SwiftHohenbergMorph", "GinzburgLandauDefects", "KuramotoSivashinskyCells", "CahnHilliardQuench", "IsingCriticalField", "XYVortexGas", "GranularOscillons", "FaradayQuasipattern", "TuringHopfBlinkers", "PhotoGuidedTuringStripes", "BistableLabyrinths", "PhaseFieldCrystalGrains", "WilliamsDomainsElectroconvection", "SmecticFocalConicMosaic", "HerringboneWrinkles", "RockPaperScissorsSpirals", "ReactionDiffusionOnFlow", "ChemicalOscillatorLattice",
    "ChaoticTaffyMixer", "ArnoldCatRecurrence", "BakerHorseshoeFold", "VortexMergerCascade", "ReversibleStokesUnmix", "LagrangianRidgeTransport", "KolmogorovMeanders", "ZonalJetBelts", "SurfaceQGFronts", "RotatingPolygonVortex", "CellularFlowMixing", "OrszagTangPlasma", "RayleighTaylorBlend", "RichtmyerMeshkovSpikes", "FerrofluidLabyrinth", "DoubleDiffusiveStaircase", "ElasticTurbulenceRibbons", "ContourDynamicsPatches",
    "DoublePendulumFlipFractal", "MagneticPendulumBasins", "ArnoldTonguesField", "LogisticVeils", "OrbitTrapStalks", "HenonHeilesEscape", "StandardMapIslands", "NewtonRelaxedBloom", "KleinianQuasiFuchsian", "RauzyFractalTiles", "TwinDragonRepTile", "FordCirclesCascade", "DeJongNebula", "LyapunovVectorHair", "MandelbrotCardioidUnwrap", "HyperbolicBilliardChaos", "CircleMapDevilStairs", "ChaoticScatteringFractal",
    "TalbotCarpet", "QuantumScarBilliard", "BeamformingLobes", "SphericalHarmonicBloom", "SolitonGasCollisions", "CnoidalWaveLattice", "StandingWaveMosaic", "WavePacketKaleido", "AiryBeamCurves", "BesselRingWeave", "DispersiveWaveTrain", "ParametricResonanceTongues", "WaveTurbulenceSpectrum", "ScarredMembraneDrum", "HolographicReconstruction", "WaveFrontFolding", "QuantumRevivalRing", "HarmonicOscillatorCoherent",
    "CausticWeb", "DispersivePrismField", "LightFieldParallaxLattice", "CoherentSpeckleBloom", "ChromaticAberrationVortex", "PolarizationRotatorField", "GrinLensDrift", "InfiniteMirrorCorridorsAbstract", "AfterimageField", "VolumetricShaftsAbstract", "FresnelLensWarp", "LightLeakChoreography", "SpectralSynthesisGlow", "KerrSelfFocusingFilaments",
    "WallpaperGroupMorph", "ConwayCriterionTiles", "IsohedralTileMorph", "QuasiperiodicDualGrid", "SpiderwebTessellation", "CirclePatternFlow", "MiuraFoldField", "YoshimuraBuckling", "KirigamiExpansion", "HoberSphereLattice", "GirihStrapwork", "ApeirogonalTiling", "PolyominoFlow", "HexToTriMorph", "ShearingMosaic", "NetsOfPolytopes", "SierpinskiCarpetBreathe", "ModularTessellationFlow",
    "Polytope600CellShadow", "TwentyFourCellBreathing", "RiemannSurfaceSheets", "SphereEversionLoop", "CostaSurfaceTunnel", "LensSpaceInterior", "PoincareDodecahedralSpace", "ThreeTorusFlight", "SolGeometryTunnel", "NilGeometryHelix", "SL2RFlowField", "ProjectivePlaneRoll", "HyperbolicDodecahedronFlight", "FlatTorusUnfold", "AlexanderHornedSphere", "AntoineNecklaceZoom",
    "LaplacianPyramidEqualizer", "KuwaharaFlowPainting", "PixelSortCascade", "PhotoFourierPhaseSwap", "HistogramFlowMatch", "SeamCarvingBreath", "TextureSynthesisGrowth", "PoissonGradientRemix", "SuperpixelMosaicFlow", "DistanceFieldEcho", "BilateralDreamGrid", "ColorTransferTide", "PhotoMeanShiftBlooms", "StructureTensorLens", "PhotoSpectralWarp", "DepthFromFocusLayers", "MorphologicalBreath", "PhotoWatershedFlood", "PatchShuffleKaleido", "ToneMappingTide",
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
CHAIN_LABS = ("ChainLab2D", "ChainLab3D", "ChainLabTunnel", "ChainSlice3D")
# Every transform-chain scene: the labs, the named chains (Chain*, Chain3D*)
# and frozen liked rolls (ChainLike*) -- not the old chain-mail scene.
def rule_transform(m, h):
    fm = re.search(r'file="[^"]*[\\/](\w+)\.frag"', h)
    n = fm.group(1) if fm else ""
    return n.startswith("Chain") and not n.startswith("Chainmail")
def rule_fxchain(m, h):     return "FxChain.frag" in h
def rule_chainlab(m, h):    return any(("%s.frag" % n) in h for n in CHAIN_LABS)
def rule_none(m, h):        return False
# Knob ranges a preset narrows for its scenes: in Kettenlabor every start walks.
KNOB_RANGES = {"Kettenlabor": {"morphP": ("0.5", "1")},
               "Transformationen": {"morphP": ("0.5", "1")}}
# Scene weights a preset scales: in Transformationen the scenes that stream the
# picture into a dark opening (tunnels, Droste zooms, log-polar spirals) were,
# with the 3D flights, two thirds of the play time -- "more than 80 % a tunnel"
# (user, 01.10.2026).  They stay, at 0.4 of their weight (about a fifth of the time).
OPENING_SCENES = {"ChainSpiralKaleido", "ChainKaleidoSpiral", "ChainFoldSpiral", "ChainWarpKaleidoSpiral",
                  "ChainSpiralInvertKaleido", "ChainP4mSpiralKaleidoWarp", "ChainTunnelKaleido", "ChainKaleidoTunnel",
                  "ChainTunnelHex", "ChainHexTunnel", "ChainTunnelLens", "ChainMirrorTunnelSpiral",
                  "ChainDrosteKaleido", "ChainWaveDrosteHex", "ChainLabTunnel", "Chain3DPolarTunnelBoxes"}
PROB_FACTOR = {"Transformationen": (0.4, OPENING_SCENES)}
# How long a chain lab stays (seconds).  Without an entry time a scene falls
# back to 20..90 s -- a lab ended before it had walked much, although walking
# with the music is what it is for (found 01.10.2026; the header times above
# are only the PHOTO pacing).
LAB_SOLO = {"Kettenlabor": (600, 1800), "Transformationen": (180, 480)}

# ---- Long walking lab stays (16.10.2026) ------------------------------------
# "Visualisations that run for hours, better days, without the same scenes
# coming back" (user, 16.10.2026).  The hand-made scenes run out -- some 400 per
# preset, each back two or three times a day -- the chain labs never do, but
# they were one entry among 400 and got about one percent of the time.  Each
# genre preset therefore gives its walking labs a share of the screen time
# (LAB_SHARE, written as labShare: the scheduler's lab clock calls a lab when
# the labs are behind, never two in a row -- values chosen by the user) and
# replaces its lab entries by genre variants (LAB_FLAVOURS): the lab files with
# the genre's knob ranges.  The walk keeps to an entry's ranges
# (EffectShader::resetChainWalk), and the classes are sorted calm .. wild, so a
# range is a character: Ambient walks the calm three fifths, Club the wild
# half, Galerie stays with the photo and the relief look.  Every variant walks
# (morphP 0.5..1) and stays LAB_STAY seconds; their probabilities only weigh
# the variants against each other (which lab, when the clock calls one).
LAB_SHARE = {"Psychedelic": 0.50, "SpaceAmbient": 0.40, "Club": 0.40, "Allround": 0.35, "Ambient": 0.35,
             "Noir": 0.25, "Galerie": 0.20}
LAB_STAY = {"Ambient": (360, 900), "SpaceAmbient": (420, 1080), "Club": (240, 600), "Psychedelic": (300, 900),
            "Noir": (300, 720), "Galerie": (240, 600), "Allround": (300, 900)}
# The characters: knob ranges as fractions of the energy-sorted class lists
# (chainAP..chainDP the 2D chain, spaceP/coreP/bodyP the 3D world, styleP the
# look: photo | relief | contour lines | flow | glowing edges) and of the plain
# knobs (speedP flow speed, paletteP photo colours .. colour field, glowP the
# afterglow from 0.15 up, detailP texture sharpness).  A knob an entry does not
# have is skipped.
CALM = {"chainAP": ("0", "0.6"), "chainBP": ("0", "0.65"), "chainCP": ("0", "0.6"), "chainDP": ("0", "0.6"),
        "spaceP": ("0", "0.7"), "coreP": ("0", "0.65"), "bodyP": ("0", "0.7"),
        "styleP": ("0", "0.8"), "speedP": ("0", "0.4"), "glowP": ("0.2", "1")}
WILD = {"chainAP": ("0.35", "1"), "chainBP": ("0.3", "1"), "chainCP": ("0.3", "1"), "chainDP": ("0.35", "1"),
        "spaceP": ("0.3", "1"), "coreP": ("0.35", "1"),
        "styleP": ("0.4", "1"), "speedP": ("0.5", "1"), "glowP": ("-0.6", "0.5"), "paletteP": ("0.3", "1")}
FULL = {}
COLOUR = {"paletteP": ("0.35", "1"), "glowP": ("0", "1")}
SPACE = {"chainAP": ("0", "0.75"), "chainDP": ("0", "0.7"), "styleP": ("0", "0.8"), "speedP": ("0", "0.35"),
         "glowP": ("0", "1")}
NOIR = {"styleP": ("0", "0.6"), "paletteP": ("0", "0.35"), "speedP": ("0", "0.6"), "glowP": ("-0.6", "0.6")}
# The gallery: the photograph stays recognisable -- photo and relief look,
# photo colours, sharp texture, and the classes before the openings (the
# tunnel-like chainAP classes sit in its upper third, chainCP spiral and
# tunnel at its end); no tunnel lab.
PHOTO = {"chainAP": ("0", "0.7"), "chainCP": ("0", "0.85"), "chainDP": ("0", "0.7"), "styleP": ("0", "0.4"),
         "paletteP": ("0", "0.35"), "detailP": ("0.5", "1"), "speedP": ("0", "0.5"), "glowP": ("-0.6", "0.4")}
# (lab, probability, ranges, extra mood tag, colour grade)
LAB_FLAVOURS = {
    "Ambient": [("ChainLab2D", 0.5, CALM, "calm", ""), ("ChainLabTunnel", 0.35, CALM, "calm", ""),
                ("ChainLab3D", 0.4, CALM, "calm", ""), ("ChainSlice3D", 0.25, CALM, "calm", "")],
    "SpaceAmbient": [("ChainLab3D", 0.6, SPACE, "calm", ""), ("ChainSlice3D", 0.45, SPACE, "calm", ""),
                     ("ChainLabTunnel", 0.3, dict(CALM, speedP=("0", "0.35")), "calm", ""),
                     ("ChainLab2D", 0.2, dict(CALM, speedP=("0", "0.35")), "calm", "")],
    "Club": [("ChainLab2D", 0.5, WILD, "aggressive", ""), ("ChainLabTunnel", 0.45, WILD, "aggressive", ""),
             ("ChainLab3D", 0.4, WILD, "aggressive", ""), ("ChainSlice3D", 0.25, WILD, "aggressive", "")],
    "Psychedelic": [("ChainLab2D", 0.5, COLOUR, "", ""), ("ChainLab2D", 0.3, WILD, "aggressive", ""),
                    ("ChainLabTunnel", 0.4, COLOUR, "", ""), ("ChainLab3D", 0.4, COLOUR, "", ""),
                    ("ChainSlice3D", 0.35, COLOUR, "", "")],
    "Noir": [("ChainLab2D", 0.5, NOIR, "dark", "fade,grey,sepia"),
             ("ChainLabTunnel", 0.35, NOIR, "dark", "fade,grey,sepia"),
             ("ChainLab3D", 0.4, NOIR, "dark", "fade,grey,sepia")],
    "Galerie": [("ChainLab2D", 0.6, PHOTO, "calm", ""), ("ChainLab3D", 0.35, PHOTO, "calm", "")],
    "Allround": [("ChainLab2D", 0.45, FULL, "", ""), ("ChainLabTunnel", 0.4, FULL, "", ""),
                 ("ChainLab3D", 0.4, FULL, "", ""), ("ChainSlice3D", 0.35, FULL, "", "")],
}

GENRES = [
    ("Ambient",     rule_ambient,     False),
    ("Club",        rule_club,        False),
    ("Noir",        rule_noir,        False),
    ("Psychedelic", rule_psychedelic, False),
    ("Galerie",     rule_galerie,     False),
    ("SpaceAmbient", rule_space,      False, rule_ambient),
    ("Allround",    rule_all,         False),
    ("Kettenlabor", rule_chainlab,    False, rule_none),
    ("Transformationen", rule_transform, False, rule_fxchain),
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

def lab_flavour(genre, lab, prob, ranges, mood_tag, grade):
    """One genre variant of a chain lab (LAB_FLAVOURS): the master entry with the variant's knob ranges, always
    walking, staying LAB_STAY[genre] seconds -- as a block tuple like the parsed ones."""
    base = [b for b in scenes if b[1] == lab]
    if not base:
        sys.exit("make_genre_configs: %s is not in %s" % (lab, SRC))
    blk = base[0][3].rstrip("\n")
    for knob, (lo, hi) in dict(ranges, morphP=("0.5", "1")).items():
        blk = re.sub(r'(<float name="%s") minValue="[^"]*" maxValue="[^"]*"' % knob,
                     r'\1 minValue="%s" maxValue="%s"' % (lo, hi), blk)
    head = blk.split(">", 1)[0]
    new_head = re.sub(r'probability="[^"]*"', 'probability="%.3g"' % prob, head, count=1)
    moods = set(base[0][2])
    if mood_tag and mood_tag not in moods:
        new_head = re.sub(r'mood="', 'mood="%s,' % mood_tag, new_head, count=1)
        moods.add(mood_tag)
    attrs = ('grade="%s" ' % grade if grade else "") + 'minTimeSolo="%d" maxTimeSolo="%d" ' % LAB_STAY[genre]
    new_head = new_head.replace("<TextureShader ", "<TextureShader " + attrs, 1)
    return ("TextureShader", lab, moods, new_head + blk[len(head):] + "\n", new_head)

# A knob named in a variant must exist on some lab (a typo would silently leave the range open).
_lab_knobs = set(re.findall(r'<float name="(\w+)"', "".join(b[3] for b in scenes if b[1] in CHAIN_LABS)))
for _genre, _variants in LAB_FLAVOURS.items():
    for _v in _variants:
        _bad = set(_v[2]) - _lab_knobs
        if _bad or _v[0] not in CHAIN_LABS:
            sys.exit("make_genre_configs: LAB_FLAVOURS[%s] names %s" % (_genre, sorted(_bad) or _v[0]))

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
# Colour grade per preset: a scene that is in the preset only as filler (its fit
# for the genre at or below the limit -- typically a colourful scene in Noir,
# which must reach MIN_SCENES) wears one of these looks there, rolled per
# activation and applied by Present.frag (EffectShader::setGradeModes).
GRADE = {"Noir": (5, "fade,grey,sepia")}
MAX_VARIANTS = 6

# ---- Screen time by show value (16.10.2026) ---------------------------------
# With the no-repeat memory the probability roll and the taste hardly change how
# often a scene comes (simulated: p >= 0.7 against p <= 0.25 3.2:1 without the
# memory, 1.6:1 with it), so a rating has to act on how LONG a scene stays --
# the one lever that turns it into screen time without bringing scenes back
# sooner.  Each scene of a genre preset gets its solo time from its show value
# v = interest + SOLO_FIT * (fit - 7): the mean doubles every SOLO_DOUBLING
# points, scaled per preset so that the mean over its entries stays the old
# default's 55 s (20..90 s) -- the same number of changes an hour; the range is
# SOLO_SPREAD around that mean.  The labs keep LAB_STAY, an entry with its own
# minTimeSolo keeps it; the scheduler stretches the stay by the learned taste.
SOLO_GENRES = set(FIT_COLUMN) | {"Allround"}
SOLO_MEAN = 55.0
SOLO_DOUBLING = 1.6
SOLO_FIT = 0.5
SOLO_SPREAD = (0.55, 1.45)
SOLO_LIMITS = (14.0, 160.0)

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

def solo_times(genre, sel):
    """Solo time (min, max) in seconds per scene name for one genre preset (SOLO_GENRES; see above)."""
    col = FIT_COLUMN.get(genre)
    own = [b for b in sel if b[0] == "TextureShader" and b[1] not in CHAIN_LABS and "minTimeSolo=" not in b[4]]
    if not own:
        return {}
    def value(s):
        if s not in fit:
            return None
        return fit[s]["interest"] + (SOLO_FIT * (fit[s][col] - 7) if col else 0.0)
    known = sorted(v for v in (value(b[1]) for b in own) if v is not None)
    middle = known[len(known) // 2] if known else 6.5
    raw = [2.0 ** (((value(b[1]) if value(b[1]) is not None else middle) - 6.5) / SOLO_DOUBLING) for b in own]
    k = SOLO_MEAN
    for _ in range(6):  # the limits pull the mean; a few rounds bring it back to SOLO_MEAN
        means = [min(max(k * r, SOLO_LIMITS[0]), SOLO_LIMITS[1]) for r in raw]
        k *= SOLO_MEAN / (sum(means) / len(means))
    return {b[1]: (round(SOLO_SPREAD[0] * m), round(SOLO_SPREAD[1] * m)) for b, m in zip(own, means)}

for entry in GENRES:
    name, rule, hidden = entry[0], entry[1], entry[2]
    fxRule = entry[3] if len(entry) > 3 else rule
    if name in FIT_COLUMN and fit:
        sel_s = select_by_fit(name, rule)
    else:
        sel_s = [b for b in scenes if rule(b[2], b[4])]
    # The genre's lab variants take the place of the plain lab entries.
    labs = [lab_flavour(name, *v) for v in LAB_FLAVOURS.get(name, [])]
    if labs:
        sel_s = [b for b in sel_s if b[1] not in CHAIN_LABS] + labs
    if name in FIT_COLUMN and fit:
        GENRE_CHOSEN.update(b[1] for b in sel_s)
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
    if name in LAB_SHARE:
        tim += ' labShare="%.2f"' % LAB_SHARE[name]
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
    if labs:
        out[-1:-1] = ["  <!-- %d walking chain lab variants (LAB_FLAVOURS), %d %% of the screen time (labShare) -->"
                      % (len(labs), round(100 * LAB_SHARE.get(name, 0)))]
    graded = 0
    solo = solo_times(name, sel_s) if name in SOLO_GENRES else {}
    for b in sel_s + sel_f + sel_t:
        blk = b[3].rstrip("\n")
        if (name in GRADE and b[0] == "TextureShader" and b[1] in fit and 'grade="' not in b[4]
                and fit[b[1]][FIT_COLUMN[name]] <= GRADE[name][0]):
            blk = blk.replace("<TextureShader ", '<TextureShader grade="%s" ' % GRADE[name][1], 1)
            graded += 1
        for knob, (lo, hi) in KNOB_RANGES.get(name, {}).items():
            blk = re.sub(r'(<float name="%s") minValue="[^"]*" maxValue="[^"]*"' % knob,
                         r'\1 minValue="%s" maxValue="%s"' % (lo, hi), blk)
        # The show value goes along (interest="..."): the scheduler's spectacle reserve rolls a drop's target
        # from the scenes of interest >= 8 (SceneScheduler::pickSpectacle).
        if b[0] == "TextureShader" and b[1] in fit and 'interest="' not in b[4]:
            blk = blk.replace("<TextureShader ", '<TextureShader interest="%d" ' % fit[b[1]]["interest"], 1)
        if b[0] == "TextureShader" and b[1] in solo and "minTimeSolo=" not in b[4]:
            blk = blk.replace("<TextureShader ", '<TextureShader minTimeSolo="%d" maxTimeSolo="%d" ' % solo[b[1]], 1)
        if name in LAB_SOLO and b[0] == "TextureShader" and b[1] in CHAIN_LABS and "minTimeSolo=" not in b[4]:
            blk = blk.replace("<TextureShader ", '<TextureShader minTimeSolo="%d" maxTimeSolo="%d" ' % LAB_SOLO[name], 1)
        if name in PROB_FACTOR and b[0] == "TextureShader" and b[1] in PROB_FACTOR[name][1]:
            blk = re.sub(r'probability="([^"]*)"', lambda m: 'probability="%.3g"' % (float(m.group(1)) * PROB_FACTOR[name][0]), blk, count=1)
        out.append(blk)
    if graded:
        print("%-12s %3d scenes wear a colour grade (%s)" % (name, graded, GRADE[name][1]))
    out.append("")
    out.append("</configuration>")
    out.append("")
    path = "Presets/%s.xml" % name
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print("%-12s %3d scenes  %2d fx  %2d trans%s -> %s"
          % (name, len(sel_s), len(sel_f), len(sel_t),
             "  (%d lab variants, %d %% labs)" % (len(labs), round(100 * LAB_SHARE[name])) if labs else "", path))
