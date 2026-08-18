#version 330 core
out vec4 fragColor;
// FxFrostDendriteFreeze.frag
// -----------------------------------------------------------------------
// FX FROST DENDRITE FREEZE: Hexagonal dendritic ice crystal freeze & melt.
// Feathery ice frostwork branches rapidly across the viewport, freezing the
// outgoing scene into crystalline frost and melting away into the incoming scene.
//   interpolation -> sweeps freezing crystallization to melting thaw
//   audioKick     -> flashes sharp dendritic ice needle growth
//   audioHigh     -> sharpens crystalline frostwork facet lines
//
// Per-activation variety:
//   frostP  float frost crystal density & scale  (0.5..2.2)
//   branchP float dendritic branch branching     (0.5..2.0)
//   speedP  float animation speed multiplier     (0.5..2.0)
//   hueP    float ice crystal shimmer hue offset (0..6.28)
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

uniform float frostP;
uniform float branchP;
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
    float frs = (frostP  > 0.0) ? frostP  : 1.0;
    float brn = (branchP > 0.0) ? branchP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // 6-fold hexagonal ice dendrite growth
    float angle6 = 6.2831853 / 6.0;
    float a = atan(p.y, p.x);
    float r = length(p);
    a = mod(a, angle6) - angle6 * 0.5;
    vec2 hexCoord = vec2(cos(a), sin(a)) * r * 15.0 * frs;

    // Dendritic side branchings
    float mainSpine = abs(hexCoord.y);
    float sideBranches = abs(sin(hexCoord.x * 2.0 * brn - hexCoord.y * 3.0));
    float frostPattern = exp(-mainSpine * 8.0) + exp(-sideBranches * 6.0) * 0.6;

    // Crystal refraction warp
    vec2 frostWarp = vec2(cos(a * 6.0), sin(a * 6.0)) * 0.02 * frostPattern * midTransition;

    vec4 c1 = texture(tex1, fract(uv + frostWarp));
    vec4 c0 = texture(tex0, fract(uv - frostWarp));

    vec4 col = mix(c1, c0, tProg);

    // Crystalline frost white/cyan glow
    vec3 frostWhite = vec3(0.85, 0.95, 1.0);
    col.rgb += frostPattern * frostWhite * midTransition * 0.7 * (1.0 + audioKick * 2.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
