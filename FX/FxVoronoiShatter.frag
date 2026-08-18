#version 330 core
out vec4 fragColor;
/**
 * @file FxVoronoiShatter.frag
 * @brief FX VORONOI SHATTER: Smooth transition where the scene dissolves through
 * a floating Voronoi cell mosaic. Each polygonal cell smoothly lifts, rotates,
 * and cross-fades with glowing cell boundaries that pulse to the audio.
 *   interpolation -> controls continuous cross-fade & cell lift progress
 *   audioKick     -> flashes cell boundary edges
 *   audioBass     -> undulates cell rotation amplitude
 *
 * Per-activation variety:
 *   cellP  float Voronoi cell grid density (0.5..2.2)
 *   liftP  float cell lift & displacement  (0.5..2.0)
 *   speedP float cell rotation velocity    (0.5..2.0)
 *   hueP   float edge glow hue offset      (0..6.28)
 */

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

uniform float cellP;
uniform float liftP;
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

float hash21(vec2 p) {
    p = fract(p * vec2(434.34, 735.21));
    p += dot(p, p + 52.32);
    return fract(p.x * p.y);
}

vec3 voronoi(vec2 p) {
    vec2 g = floor(p);
    vec2 f = fract(p);
    float minDist = 1.0;
    vec2 minOffset = vec2(0.0);
    vec2 minLattice = vec2(0.0);

    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 lattice = vec2(float(x), float(y));
            vec2 offset = vec2(hash21(g + lattice), hash21(g + lattice + 33.7));
            vec2 d = lattice + offset - f;
            float dist = length(d);
            if (dist < minDist) {
                minDist = dist;
                minOffset = offset;
                minLattice = lattice;
            }
        }
    }
    return vec3(minDist, minOffset);
}

void main() {
    float cll = (cellP  > 0.0) ? cellP  : 1.0;
    float lft = (liftP  > 0.0) ? liftP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Transition progress: tProg in [0, 1]
    float tProg = clamp(interpolation, 0.0, 1.0);
    float ease = smoothstep(0.0, 1.0, tProg);

    // Voronoi cell evaluation
    vec2 cellCoord = p * 12.0 * cll;
    vec3 v = voronoi(cellCoord);
    float cellDist = v.x;
    float cellSeed = v.y;

    // Per-cell staggered transition timing
    float cellDelay = fract(cellSeed * 7.13);
    float cellProg = clamp((tProg - cellDelay * 0.3) / 0.7, 0.0, 1.0);
    cellProg = smoothstep(0.0, 1.0, cellProg);

    // Dynamic rotation & displacement during mid-transition
    float midTransition = sin(cellProg * 3.14159265);
    float cellAngle = (cellSeed - 0.5) * 1.5 * midTransition * lft * (1.0 + 0.5 * audioBass);
    vec2 dispUV = (rot2D(cellAngle) * (uv - 0.5)) + 0.5;

    // Sample incoming and outgoing textures
    vec4 c1 = texture(tex1, fract(dispUV));
    vec4 c0 = texture(tex0, fract(dispUV));

    // Smooth blend
    vec4 col = mix(c1, c0, cellProg);

    // Glowing cell borders
    float border = exp(-cellDist * 20.0) * midTransition;
    vec3 borderGlow = vec3(0.3, 0.85, 1.0) * border * (1.5 + audioKick * 3.0);
    col.rgb += borderGlow;

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
