#version 330 core
out vec4 fragColor;
/**
 * @file CavitationBubbleCollapse.frag
 * @brief TRANSITION CAVITATION BUBBLE COLLAPSE: bubbles grow in the outgoing
 * scene and collapse.  Each collapse leaves the incoming scene where the bubble
 * stood and sends a shock ring out through the liquid.
 *
 * A cavitation bubble is not a bubble that pops.  It grows while the pressure
 * is low and then collapses violently -- the collapse is far faster than the
 * growth, and it is the collapse, not the growth, that does the work.  So the
 * radius here rises slowly and comes down steeply, and the light and the shock
 * ring are tied to the last moment of that fall.  A symmetric grow-and-shrink
 * would look like breathing, which is the one thing cavitation is not.
 *
 * What the collapse leaves behind is permanent: the liquid does not go back.
 * That is what carries the transition, and it is why the frame is fully the
 * incoming scene by the end without any extra fade.
 *
 * Audio Reactivity:
 *   audioKick  -> the light of a collapse (light, local)
 *   audioBass  -> how fast bubbles grow (slow)
 *   audioHigh  -> the shock ring's edge (light)
 *   audioSwell -> the bubble size (slow)
 *
 * Per-activation variety: sitesP, sizeP, hueP.
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

uniform float sitesP;
uniform float sizeP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float sites = 3.0 + floor(clamp(sitesP, 0.0, 1.0) * 4.0);   // rolled ONCE
    float size  = (sizeP > 0.0) ? sizeP : 1.0;
    float hue   = (hueP  > 0.0) ? hueP  : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);
    vec2  sc = vec2(1.0 / aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    float grow = 0.8 + 0.5 * clamp(audioBass, 0.0, 1.0);

    float cell = 0.62 / sites;
    vec2  gi = floor(p / cell);

    float converted = 0.0;     // how much of this pixel the collapses have taken
    float inBub = 0.0, bubRim = 0.0, flash = 0.0, shock = 0.0;
    vec2  refr = vec2(0.0);

    // Two cells out: the ring below is sized so it can never reach further.
    for (int j = -2; j <= 2; ++j)
    for (int i = -2; i <= 2; ++i)
    {
        vec2 id = gi + vec2(float(i), float(j));
        vec2 jit = vec2(hash21(id + 4.1), hash21(id + 11.9)) - 0.5;
        vec2 c = (id + 0.5 + jit * 0.8) * cell;
        float t0 = hash21(id + 23.7) * 0.60;                  // its moment, fixed
        float dur = (0.24 + 0.14 * hash21(id + 37.1)) / grow;
        float raw = (d - t0) / dur;                            // <0 before, >1 after

        float R = cell * (0.40 + 0.20 * hash21(id + 51.3)) * size
                * (0.85 + 0.30 * clamp(audioSwell, 0.0, 1.0));

        if (raw > 0.0 && raw < 1.0)
        {
            // Slow rise, steep fall: the collapse is the fast part.
            float r = R * (raw < 0.72 ? smoothstep(0.0, 0.72, raw)
                                      : pow(1.0 - (raw - 0.72) / 0.28, 2.2));
            float dist = length(p - c);
            float ins = smoothstep(r, r * 0.88, dist);
            if (ins > inBub)
            {
                inBub = ins;
                float rr = clamp(dist / max(r, 1e-4), 0.0, 1.0);
                vec2 n = (dist > 1e-5) ? (p - c) / dist : vec2(0.0);
                // A vapour cavity is a strong negative lens.
                refr = -n * (1.0 - cos(rr * PI * 0.5)) * r * 0.85;
            }
            bubRim = max(bubRim, exp(-pow((dist - r) / max(r * 0.13, 1e-4), 2.0)));
            // The light of the last instant of the fall.
            flash = max(flash, ins * smoothstep(0.90, 1.0, raw));
        }

        // The shock ring, after the collapse, and what it leaves behind.
        // The conversion has to follow the RING, not the cell: a whole cell
        // flipping at once leaves a visible rectangle, which is exactly what
        // this looked like before.
        float post = (raw - 1.0) / 0.42;
        if (post > 0.0)
        {
            // Stays inside the searched neighbourhood: a ring that reaches
            // further than the loop looks for would end at a cell boundary.
            float rs = R * (0.25 + 0.95 * min(post, 1.0));
            float dist = length(p - c);
            if (post < 1.0)
                shock = max(shock, exp(-pow((dist - rs) / (R * 0.13), 2.0)) * (1.0 - post));
            // Inside the ring the liquid does not go back.
            converted = max(converted, smoothstep(rs, rs * 0.86, dist));
        }
    }
    converted = mix(converted, 1.0, smoothstep(0.90, 1.0, d));

    vec3 liquid = texture(tex0, uv).rgb;
    vec3 after  = texture(tex1, uv).rgb;
    vec3 col = mix(liquid, after, clamp(converted, 0.0, 1.0));

    // Inside a cavity: the liquid behind it, bent hard by the vapour.
    vec3 through = textureLod(tex0, clamp(uv + refr * sc, 0.0, 1.0), 0.0).rgb;
    col = mix(col, through * 0.60, inBub * (1.0 - converted));
    col += vec3(0.85, 0.92, 1.0) * bubRim * (1.0 - converted) * arc
         * (0.05 + 0.12 * clamp(audioHigh * 2.0, 0.0, 1.0));

    // The collapse itself, and the ring it sends out.
    col += vec3(1.0, 0.96, 0.90) * flash * arc * (0.10 + 0.34 * clamp(audioKick, 0.0, 1.0));
    col += vec3(0.80, 0.90, 1.0) * shock * arc
         * (0.07 + 0.18 * clamp(audioHigh * 2.0, 0.0, 1.0));
    // The ring compresses the liquid it passes through.
    col *= 1.0 + shock * 0.12 * arc;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
