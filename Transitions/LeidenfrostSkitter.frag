#version 330 core
out vec4 fragColor;
/**
 * @file LeidenfrostSkitter.frag
 * @brief TRANSITION LEIDENFROST SKITTER: the outgoing scene breaks into
 * droplets that ride on their own vapour and skitter away, uncovering the
 * incoming scene on the hot plate beneath.
 *
 * Above the Leidenfrost point a drop does not wet the surface: it floats on a
 * cushion of its own vapour, and with almost nothing to hold it, it slides on
 * the smallest slope and hardly slows down.  So each droplet here keeps its own
 * direction and its own steady speed for the whole turn -- a drop that
 * decelerated would be a drop that is touching something.
 *
 * The other half of the effect is under the drop, not in it: the vapour cushion
 * is a lens, so the incoming scene is bent where a droplet passes over it.  And
 * a floating drop shrinks as it boils away, which is what finally clears the
 * frame.
 *
 * Audio Reactivity:
 *   audioSubBass -> the plate's temperature: the cushion's thickness (slow)
 *   audioMid     -> the drift direction the drops all lean into (slow)
 *   audioHigh    -> the specular point on each drop (light)
 *   audioKick    -> the light off the plate (light)
 *
 * Per-activation variety: dropsP, driftP, hueP.
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

uniform float dropsP;
uniform float driftP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float drops = 2.0 + floor(clamp(dropsP, 0.0, 1.0) * 3.0);   // rolled ONCE
    float drift = (driftP > 0.0) ? driftP : 1.0;
    float hue   = (hueP   > 0.0) ? hueP   : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);
    vec2  sc = vec2(1.0 / aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // The plate's temperature sets how thick the cushion is.
    float cushion = 0.55 + 0.75 * clamp(audioSubBass, 0.0, 1.0);
    // The whole plate leans one way; the drops all take that slope.
    float lean = (clamp(audioMid * 2.0, 0.0, 1.0) - 0.5) * 1.6;

    float cell = 0.66 / drops;
    vec2  g = p / cell;
    vec2  gi = floor(g);

    float inDrop = 0.0, rimD = 0.0, spec = 0.0, cushD = 0.0;
    vec2  bend = vec2(0.0);
    vec2  dropUv = uv;

    for (int j = -2; j <= 2; ++j)
    for (int i = -2; i <= 2; ++i)
    {
        vec2 id = gi + vec2(float(i), float(j));
        vec2 jit = vec2(hash21(id + 5.3), hash21(id + 12.1)) - 0.5;
        vec2 c0 = (id + 0.5 + jit * 0.7) * cell;
        // Its own direction and its own steady speed, both fixed: nothing here
        // slows a drop down, because nothing is touching it.
        float a = hash21(id + 31.7) * 6.2831853;
        vec2  dir = vec2(cos(a) + lean * 0.7, sin(a) * 0.7 + 0.25);
        // Kept within the searched neighbourhood, or a drop would wink out
        // when it crosses out of it.
        float spd = cell * (0.40 + 0.50 * hash21(id + 44.9)) * drift;
        // Bounded the same way: a drop that slides out of the searched
        // neighbourhood would wink out at a cell boundary.
        vec2  c = c0 + dir * min(spd * d, cell * 1.5);
        // Boiling away: the radius falls steadily.
        // Well inside its cell: touching drops read as a heap of marbles
        // instead of separate drops riding on their own vapour.
        float r = cell * 0.42 * (1.0 - 0.62 * d) * (0.72 + 0.5 * hash21(id + 7.7));
        if (r <= 0.0) continue;
        vec2  q = p - c;
        float dist = length(q);
        float inside = smoothstep(r, r * 0.90, dist);
        if (inside > inDrop)
        {
            inDrop = inside;
            // A drop is a lens: what is inside it is bent toward its centre.
            float rr = clamp(dist / r, 0.0, 1.0);
            vec2  n = (dist > 1e-5) ? q / dist : vec2(0.0);
            dropUv = clamp(uv - n * (0.5 - 0.5 * cos(rr * PI)) * r * 0.55 * sc, 0.0, 1.0);
            spec = exp(-pow(length(q - vec2(-r * 0.34, r * 0.34)) / (r * 0.20), 2.0));
        }
        rimD = max(rimD, exp(-pow((dist - r) / (r * 0.16), 2.0)));
        // The vapour cushion reaches past the drop and bends the plate under it.
        float halo = exp(-pow(dist / (r * 1.9), 2.0));
        cushD = max(cushD, halo);
        bend += ((dist > 1e-5) ? q / dist : vec2(0.0)) * halo * 0.018 * cushion;
    }

    // The plate, seen through the vapour.
    vec3 plate = textureLod(tex1, clamp(uv + bend * sc, 0.0, 1.0), 0.0).rgb;
    plate *= 1.0 + cushD * 0.20 * arc * (0.3 + 0.9 * clamp(audioKick, 0.0, 1.0));

    // textureLod: the lens offset is picked per pixel by a branch, so its
    // implicit derivative jumps at a drop's edge and the sampler would drop
    // to its coarsest mip level -- blurred rectangular blocks.
    vec3 drop = textureLod(tex0, dropUv, 0.0).rgb;
    // A drop is water, not a marble: the plate shows through it, refracted.
    drop = mix(drop, plate * 0.85, 0.30);
    // Denser than air: it darkens at the rim and carries a highlight.
    drop *= 1.0 - rimD * 0.42;
    // A small, tight highlight: brightening the whole drop turned a field of
    // droplets into a field of lamps.
    drop += vec3(1.0, 0.97, 0.92) * spec * inDrop
          * (0.16 + 0.30 * clamp(audioHigh * 2.0, 0.0, 1.0));

    // At the start the film is unbroken; at the end the plate is dry.
    float broken = smoothstep(0.0, 0.22, d);
    float cover = mix(1.0, inDrop, broken);
    cover *= 1.0 - smoothstep(0.86, 1.0, d);

    vec3 col = mix(plate, drop, clamp(cover, 0.0, 1.0));
    col += vec3(0.90, 0.94, 1.0) * rimD * cover * arc * 0.06;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
