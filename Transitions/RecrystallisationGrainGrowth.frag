#version 330 core
out vec4 fragColor;
/**
 * @file RecrystallisationGrainGrowth.frag
 * @brief TRANSITION RECRYSTALLISATION GRAIN GROWTH: strain-free grains of the
 * incoming scene nucleate in the deformed outgoing one and eat it, until the
 * frame is a fresh grain structure.
 *
 * The tessellation is the physics.  Grains nucleate at different MOMENTS and
 * then grow at their own steady rates, so what owns a pixel is whichever grain
 * reaches it first: distance minus rate times the time since that grain was
 * born.  That is a Johnson-Mehl tessellation, and it looks different from a
 * plain Voronoi in exactly the way real recrystallised metal does -- early
 * grains are big with curved boundaries, late ones are small and wedged into
 * the gaps, and no boundary is a straight bisector.
 *
 * The parent phase is deformed, so it is drawn smeared along its own slip
 * direction; a grain that consumes it hands back an undistorted picture, which
 * is what recrystallisation actually buys.
 *
 * Audio Reactivity:
 *   audioSwell   -> the temperature: how fast the boundaries move (slow)
 *   audioChroma  -> the grain's orientation seen as a tint (colour)
 *   audioHigh    -> the light along a moving boundary (light)
 *   audioKick    -> the flash of a grain meeting another (light)
 *
 * Per-activation variety: nucleiP, rateP, hueP.
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

uniform float nucleiP;
uniform float rateP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float nuclei = 3.0 + floor(clamp(nucleiP, 0.0, 1.0) * 4.0);   // rolled ONCE
    float rate   = (rateP > 0.0) ? rateP : 1.0;
    float hue    = (hueP  > 0.0) ? hueP  : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    float temp = rate * (0.75 + 0.55 * clamp(audioSwell, 0.0, 1.0));

    float cell = 0.70 / nuclei;
    vec2  gi = floor(p / cell);

    float w1 = 1e9, w2 = 1e9;      // nearest and second-nearest weighted distance
    vec2  bestId = vec2(0.0);
    float bestBirth = 0.0;
    for (int j = -2; j <= 2; ++j)
    for (int i = -2; i <= 2; ++i)
    {
        vec2 id = gi + vec2(float(i), float(j));
        vec2 jit = vec2(hash21(id + 2.7), hash21(id + 8.9)) - 0.5;
        vec2 c = (id + 0.5 + jit * 0.85) * cell;
        float birth = hash21(id + 17.1) * 0.38;                 // its moment, fixed
        // Fast enough that the grains IMPINGE well before the end: a grain
        // structure is polygonal because neighbours meet, and grains that
        // never meet stay circles and read as bubbles.
        float v = cell * (2.40 + 1.20 * hash21(id + 29.3)) * temp;
        // Fast growth AND a bounded reach: once neighbours have met, the frame
        // is completely tiled, so anything past that is invisible anyway -- but
        // a grain that outgrows the search loop ends at a CELL boundary, which
        // is very visible.  Two cells is inside what the loop looks at.
        float reach = min(v * max(0.0, d - birth), cell * 2.0);
        // Whoever gets here first owns the pixel.
        float w = length(p - c) - reach;
        if (w < w1) { w2 = w1; w1 = w; bestId = id; bestBirth = birth; }
        else if (w < w2) { w2 = w; }
    }

    // Transformed where a grain has actually arrived.
    float grain = smoothstep(0.004, -0.004, w1);
    grain = mix(grain, 1.0, smoothstep(0.88, 1.0, d));

    // The parent phase is deformed: smeared along its slip direction.
    vec2 slip = vec2(0.94, 0.34) * 0.012 * arc;
    vec3 parent = (texture(tex0, clamp(uv + slip, 0.0, 1.0)).rgb
                 + texture(tex0, clamp(uv - slip, 0.0, 1.0)).rgb
                 + texture(tex0, uv).rgb) / 3.0;
    parent *= 0.92;

    // A grain's orientation shows as a small, steady tint.
    float orient = hash21(bestId + 41.7);
    vec3 fresh = texture(tex1, uv).rgb;
    fresh = hueRot(fresh, (orient - 0.5) * 0.34 * arc + hue * 0.05 * arc);
    fresh *= 0.94 + 0.14 * orient;

    vec3 col = mix(parent, fresh, grain);

    // The boundary between two grains: where the two nearest agree.
    float bnd = exp(-pow((w2 - w1) / (cell * 0.13), 2.0)) * grain;
    col *= 1.0 - bnd * 0.62;
    col += vec3(0.88, 0.92, 1.0) * bnd * arc
         * (0.05 + 0.20 * clamp(audioHigh * 2.0, 0.0, 1.0) + 0.14 * clamp(audioKick, 0.0, 1.0));
    // The moving front itself carries a little light.
    float front = exp(-pow(w1 / (cell * 0.10), 2.0)) * (1.0 - smoothstep(0.88, 1.0, d));
    col += vec3(1.0, 0.95, 0.86) * front * arc * 0.16;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
