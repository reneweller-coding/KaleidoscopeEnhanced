# -*- coding: utf-8 -*-
"""Regenerate the genre presets (and the one Test preset) from Komplett.xml.

Komplett.xml is the master list: every scene and FX entry lives there with
its mood tags, formulas and parameter ranges.  This tool filters that master
by mood into the genre configurations, so adding a scene to Komplett (with
moods) and re-running this script is all it takes to roll it out everywhere.

    python Tools/make_genre_configs.py          (run from the repo root)

Genres (scene AND FX entries are filtered by the same rule):
    Ambient      calm or dreamy, never aggressive
    SpaceAmbient the hand-curated `space` tag: ships, worlds, deep sky --
                 long scene times and long crossfades (see TIMING)
    Club         aggressive, or bright without calm
    Noir         dark
    Psychedelic  psychedelic
    Galerie      calm/bright/dreamy, never aggressive or psychedelic
    Allround     everything
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

SRC = "Configurations/Komplett.xml"
# Relative to the executable's working directory (bin/), exactly like the
# shader paths ("..\\\\Scene2D\\\\X.frag").  The bundled photo library lives in
# Images/ beside Configurations/; a user who wants their own pictures sets
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
# calm but belong in the mood anyway.
def rule_space(m, h):       return "space" in m

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
    # 03.09.: vierte Fuenfzig, Block A (Erde und Wetter): Haboob, Permafrost, Salzsee,
    # Kalbungsfront, Eisberg, Nachtwolken, Hurrikanauge, Halo, Fata Morgana, Seismograph.
    "HaboobDustWall",
    "PermafrostPolygons",
    "SalarMirrorFlats",
    "GlacierCalvingFront",
    "IcebergWaterline",
    "NoctilucentClouds",
    "HurricaneEyeWall",
    "SundogHaloSky",
    "FataMorganaMirage",
    "SeismographDrum",
}

def rule_recent(m, h):
    fm = re.search(r'file="[^"]*[\\/](\w+)\.frag"', h)
    return bool(fm) and fm.group(1) in RECENT_SCENES

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

for entry in GENRES:
    name, rule, hidden = entry[0], entry[1], entry[2]
    fxRule = entry[3] if len(entry) > 3 else rule
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
    path = "Configurations/%s.xml" % name
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print("%-12s %3d scenes  %2d fx  %2d trans -> %s"
          % (name, len(sel_s), len(sel_f), len(sel_t), path))
