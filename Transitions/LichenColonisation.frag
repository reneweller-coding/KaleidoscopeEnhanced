#version 330 core
out vec4 fragColor;
/**
 * @file LichenColonisation.frag
 * @brief TRANSITION LICHEN COLONISATION: crustose lichen spreads out from
 * spores across the outgoing scene until the incoming one has taken the rock.
 *
 * A crustose thallus grows only at its margin, so what it leaves behind is a
 * record: concentric zones of older and newer growth, and a margin that is
 * lobed rather than round because the growth rate varies around the rim.  Both
 * come free here from one radius that carries an angular ripple, and both are
 * what separate a lichen from a spreading circle.
 *
 * The other giveaway is what happens where two thalli meet: they do not merge
 * and they do not overlap, they stop and leave a dark competition line.  That
 * needs the two nearest colonies, not just the nearest.
 *
 * Audio Reactivity:
 *   audioSwell   -> the growth rate (slow)
 *   audioValence -> the species colour, grey-green to sulphur (colour)
 *   audioHigh    -> the light on the growing margin (light)
 *   audioMid     -> the texture of the older zones (colour)
 *
 * Per-activation variety: sporesP, lobeP, hueP.
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

uniform float sporesP;
uniform float lobeP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float spores = 3.0 + floor(clamp(sporesP, 0.0, 1.0) * 4.0);   // rolled ONCE
    float lobes  = (lobeP > 0.0) ? lobeP : 1.0;
    float hue    = (hueP  > 0.0) ? hueP  : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    float growth = 0.85 + 0.55 * clamp(audioSwell, 0.0, 1.0);

    float cell = 0.68 / spores;
    vec2  gi = floor(p / cell);

    // Nearest and second-nearest margin distance: the second is what makes the
    // competition line between two colonies.
    float e1 = 1e9, e2 = 1e9;
    float zone = 0.0, tint = 0.0;
    for (int j = -2; j <= 2; ++j)
    for (int i = -2; i <= 2; ++i)
    {
        vec2 id = gi + vec2(float(i), float(j));
        vec2 jit = vec2(hash21(id + 2.3), hash21(id + 7.1)) - 0.5;
        vec2 c = (id + 0.5 + jit * 0.8) * cell;
        float t0 = hash21(id + 15.7) * 0.42;                 // when the spore took
        // Bounded so a thallus never outgrows the searched neighbourhood.
        float r = min(cell * (1.8 + 0.9 * hash21(id + 33.1)) * growth * max(0.0, d - t0),
                      cell * 2.0);
        if (r <= 0.0) continue;
        vec2 q = p - c;
        float dist = length(q);
        float ang = atan(q.y, q.x);
        // The margin is lobed: the rim advances faster in some directions.
        // Two ripples of different order, so the margin is irregular rather
        // than a rosette: one symmetry alone reads as a snowflake.
        float lobe = 1.0 + 0.10 * lobes * sin(ang * (5.0 + floor(hash21(id + 4.4) * 4.0))
                                              + hash21(id + 8.8) * 6.28)
                         + 0.06 * lobes * sin(ang * (11.0 + floor(hash21(id + 6.2) * 6.0))
                                              + hash21(id + 3.4) * 6.28);
        float edgeDist = dist - r * lobe;
        if (edgeDist < e1)
        {
            e2 = e1; e1 = edgeDist;
            // Concentric growth zones: a record of the seasons it took.
            zone = 0.5 + 0.5 * cos(clamp(dist / max(r * lobe, 1e-4), 0.0, 1.0) * 9.0 * PI);
            tint = hash21(id + 51.9);
        }
        else if (edgeDist < e2) e2 = edgeDist;
    }

    float on = smoothstep(0.004, -0.004, e1);
    on = mix(on, 1.0, smoothstep(0.86, 1.0, d));

    // The species colour, from grey-green to sulphur yellow.
    vec3 sp = mix(vec3(0.62, 0.68, 0.58), vec3(0.86, 0.84, 0.36),
                  clamp(audioValence, 0.0, 1.0) * 0.7 + tint * 0.3);
    sp = mix(sp, sp.gbr, fract(hue * 0.159) * 0.4);

    vec3 rock = texture(tex0, uv).rgb;
    vec3 under = texture(tex1, uv).rgb;
    // The thallus is thin: the picture beneath comes through, tinted and
    // roughened by the crust's own texture.
    vec3 crust = mix(under, under * sp * 1.5, 0.55);
    crust *= 0.86 + 0.26 * zone * (0.6 + 0.6 * clamp(audioMid * 2.0, 0.0, 1.0));
    crust *= 0.90 + 0.18 * noise2(p * 190.0);

    vec3 col = mix(rock, crust, on);

    // Where two colonies met, neither goes further.
    float line = exp(-pow((e2 - e1) / (cell * 0.06), 2.0)) * on;
    col *= 1.0 - line * 0.45 * arc;
    // The growing margin is paler than the crust behind it.
    float margin = exp(-pow(e1 / (cell * 0.055), 2.0)) * (1.0 - smoothstep(0.86, 1.0, d));
    col += sp * margin * arc * (0.10 + 0.26 * clamp(audioHigh * 2.0, 0.0, 1.0));
    // The crust is a tint on the picture beneath, and the tint has to go with
    // the turn: without this the last frame is the incoming scene in lichen
    // colours rather than the incoming scene.
    col = mix(col, under, smoothstep(0.88, 1.0, d));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
