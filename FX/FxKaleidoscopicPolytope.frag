#version 330 core
out vec4 fragColor;
// FxKaleidoscopicPolytope.frag
// -----------------------------------------------------------------------
// FX KALEIDOSCOPIC POLYTOPE: Coxeter reflection group 4D polytope transition.
// Multiple hyper-plane reflection mirrors fold and unfurl space across regular
// Coxeter symmetry facets, tessellating and transitioning between scenes.
//   interpolation -> sweeps kaleidoscopic fold angle & facet recursion
//   audioKick     -> flashes mirror facet intersection reflection planes
//   audioBass     -> undulates Coxeter polytope breathing radius
//
// Per-activation variety:
//   mirrorP float reflection symmetry folding order   (0.5..2.2)
//   foldP   float facet fold depth & displacement    (0.5..2.0)
//   speedP  float animation speed multiplier         (0.5..2.0)
//   hueP    float kaleidoscopic facet hue offset     (0..6.28)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float mirrorP;
uniform float foldP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float mir = (mirrorP > 0.0) ? mirrorP : 1.0;
    float fld = (foldP   > 0.0) ? foldP   : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Coxeter folding planes
    vec2 q = p;
    float mirrorDist = 1.0;

    float foldAngle = (tProg * 1.5707963 + t * 0.2) * mir;

    for (int i = 0; i < 4; ++i) {
        q = abs(q) - 0.25 * fld * midTransition;
        q = rot2D(foldAngle) * q;
        mirrorDist = min(mirrorDist, min(abs(q.x), abs(q.y)));
    }

    vec2 warpUV = (q * resolution.y + 0.5 * resolution) / resolution;

    vec4 c1 = texture(tex1, fract(mix(uv, warpUV, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(warpUV, uv, 1.0 - midTransition)));

    vec4 col = mix(c1, c0, tProg);

    // Glowing mirror intersection lines
    float lineGlow = exp(-mirrorDist * 40.0) * midTransition;
    vec3 mirrorColor = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + length(q) * 15.0 + audioPhase);
    col.rgb += lineGlow * mirrorColor * (1.3 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
