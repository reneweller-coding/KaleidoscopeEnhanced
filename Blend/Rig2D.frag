#version 330 core
// Rig2D.frag — the 2D camera rig: rotate / zoom / pan a finished 2D scene
// frame before the combine stage consumes it.  Driven per preset by formulas
// named rig2Roll (radians), rig2Zoom (>0 = closer), rig2X/rig2Y (pan, UV
// units) plus host-INTEGRATED rig2…V rate channels — the 2D counterpart of
// the Scene3D projM rig, applied by FilterShader as an extra fullscreen pass
// only while a formula is active.  Out-of-frame samples are MIRROR-FOLDED
// (the house seamless technique), so a rotated frame never shows borders.
// UV from gl_FragCoord, NOT from a vUV varying: the editor preview's
// fullscreen vert provides no texcoords, the engine's Fullscreen.vert does —
// gl_FragCoord works identically under both.
uniform sampler2D tex;
uniform vec2  resolution;
uniform float rigRoll;
uniform float rigZoom;
uniform vec2  rigPan;
out vec4 fragColor;

void main()
{
    vec2 p = gl_FragCoord.xy / resolution - 0.5;
    float s = sin(-rigRoll), c = cos(-rigRoll);
    p = mat2(c, -s, s, c) * p;
    p /= max(1.0 + rigZoom, 0.05);
    p += 0.5 - rigPan;
    // Mirror fold, IDENTITY inside [0,1] (p=0 -> 0, p=1 -> 1) and seamlessly
    // mirrored beyond -- the plain abs(fract(...)) form would flip the frame.
    p = 1.0 - abs(fract(p * 0.5) * 2.0 - 1.0);
    fragColor = texture(tex, p);
}
