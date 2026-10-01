# -*- coding: utf-8 -*-
"""3D chains: the camera no longer always looks straight ahead.  Flying ahead
shows the vanishing point -- the dark opening the eye keeps flying into (user,
01.10.2026: "the real dark openings you keep flying into are the problem").
A new knob camP picks one of five gazes (ahead, out of the right window,
slanted down, out of the left window, slanted up); the scene pans on to the
next gaze every few minutes.  sceneTime only -- never the music (no camera on
audio).  Also moves the hit tolerance 0.0015 t (so far only in the lab's
source) into the shared template."""
import io, os
SG = os.path.dirname(os.path.abspath(__file__))

def rw(p, pairs):
    s = io.open(p, encoding="utf-8").read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:60])
        s = s.replace(a, b)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)

GAZE = """    return mat3(rt, cross(fw, rt), fw);
}
// The gaze: where the camera looks relative to its flight.  Straight ahead
// shows the vanishing point -- a dark opening the eye keeps flying into -- so
// that is only one of five: 0 ahead, 1 out of the right window (the world
// slides past with parallax, no vanishing point), 2 slanted down ahead, 3 out
// of the left window, 4 slanted up.  The knob picks the first; the scene pans
// on to the next every ~4 minutes (a ~1 minute pan) and the gaze drifts a
// little.  Time only, never the music: the camera does not follow the audio.
vec2 gazeAngles(float k)
{
    float i = mod(k, 5.0);
    if (i > 3.5) return vec2(-0.3, 0.75);
    if (i > 2.5) return vec2(-1.35, 0.08);
    if (i > 1.5) return vec2(0.35, -0.8);
    if (i > 0.5) return vec2(1.35, -0.08);
    return vec2(0.0);
}
vec3 gazeDir(vec2 p, float cam, float time)
{
    float g = floor(clamp(cam, 0.0, 0.999) * 5.0) + 0.004 * time;
    float k = floor(g), f = smoothstep(0.75, 1.0, fract(g));
    vec2 a = mix(gazeAngles(k), gazeAngles(k + 1.0), f);   // (yaw, pitch)
    a += vec2(0.12 * sin(0.031 * time), 0.08 * sin(0.023 * time + 1.0));
    vec3 d = normalize(vec3(p, 1.1));
    d.yz = rot2(a.y) * d.yz;
    d.xz = rot2(-a.x) * d.xz;
    return d;
}"""

rw(os.path.join(SG, "gen.py"), [("""    return mat3(rt, cross(fw, rt), fw);
}""", GAZE)])

rw(os.path.join(SG, "make_chains3d.py"), [
    ("//@params styleP speedP detailP paletteP\n", "//@params styleP speedP detailP paletteP camP\n"),
    (" * following the 2D chain), hueP.\n",
     " * following the 2D chain), camP (the gaze: ahead, out of a side window, slanted down or up -- it pans on\n"
     " * every few minutes), hueP.\n"),
    ("    vec3 rd = cf * normalize(vec3(p, 1.1));\n", "    vec3 rd = cf * gazeDir(p, camP, sceneTime);\n"),
    ("        if (abs(d) < 0.0008 * t) {{ hit = true;", "        if (abs(d) < 0.0015 * t) {{ hit = true;"),
])

rw(os.path.join(SG, "src", "ChainLab3D.glsl"), [])   # rebuilt below by make_chainlab3d.py
p = os.path.join(SG, "make_chainlab3d.py")
s = io.open(p, encoding="utf-8").read()
print("lab params line in HEAD:", "//@params spaceP" in s)
