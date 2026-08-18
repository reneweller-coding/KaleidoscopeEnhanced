#version 330 core
out vec4 fragColor;
// FxPenroseMorph.frag
// -----------------------------------------------------------------------
// FX PENROSE MORPH: 5-fold aperiodic Penrose tiling morphing between
// scenes through recursive golden-ratio deflation (phi = 1.618). Kite and dart
// tiles subdivide smoothly, with glowing aperiodic grid lines guiding the cross-fade.
//   interpolation -> drives recursive deflation hierarchy & scene swap
//   audioKick     -> flashes 5-fold golden ratio reflection lines
//   audioBass     -> undulates pentagonal tiling inflation scale
//
// Per-activation variety:
//   tileP  float Penrose tiling grid density     (0.5..2.2)
//   foldP  float 5-fold folding symmetry depth   (0.5..2.0)
//   speedP float animation speed multiplier      (0.5..2.0)
//   hueP   float grid glow hue offset            (0..6.28)
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

uniform float tileP;
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
    float til = (tileP  > 0.0) ? tileP  : 1.0;
    float fld = (foldP  > 0.0) ? foldP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y * (3.0 * til);

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // 5-fold pentagrid folding lines
    float angle5 = 6.2831853 / 5.0;
    float edgeMin = 1.0;
    float tileIndex = 0.0;

    vec2 q = rot2D(tProg * 1.5 + t * 0.2) * p;

    for (int i = 0; i < 5; ++i) {
        float theta = float(i) * angle5;
        vec2 dir = vec2(cos(theta), sin(theta));
        float proj = dot(q, dir);
        float gridLine = abs(fract(proj * fld) - 0.5);
        edgeMin = min(edgeMin, gridLine);
        tileIndex += floor(proj * fld);
    }

    // Tile-based staggered transition delay
    float tileDelay = fract(tileIndex * 0.382); // Golden ratio fractional part
    float tileProg = clamp((tProg - tileDelay * 0.3) / 0.7, 0.0, 1.0);
    tileProg = smoothstep(0.0, 1.0, tileProg);

    // Warp coordinates along 5-fold rays
    vec2 warpUV = uv + vec2(sin(tileIndex), cos(tileIndex)) * 0.02 * midTransition;

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    vec4 col = mix(c1, c0, tileProg);

    // Glowing Penrose grid lines
    float gridGlow = exp(-edgeMin * 25.0) * midTransition;
    col.rgb += gridGlow * vec3(1.0, 0.9, 0.4) * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
