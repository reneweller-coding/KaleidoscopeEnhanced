#version 330 core
out vec4 fragColor;
/**
 * @file FiberOpticChandelier.frag
 * @brief FIBER OPTIC CHANDELIER: a vast fibre-optic chandelier seen from
 * directly below, in the dark stairwell it hangs in -- the handrails of the
 * floors above ringing it, smaller and smaller toward the top -- a thousand glass
 * strands spraying out from a glowing hub like a dandelion clock, sagging
 * as they fan out, each ending in a point of light.  Pulses of light run
 * outward through the strands, and the tips glow in the colour of their
 * pitch class: when a note sounds, its strands light up across the whole
 * crown.  The chandelier and the camera are still.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> the tips and pulses of each pitch class's strands (light)
 *   audioBass       -> the hub's glow (light)
 *   audioLevel      -> brightness
 *   sceneTime / sceneAdvance -> the pulses running out along the strands
 *
 * Per-activation variety: spreadP (how wide the crown fans), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioBass;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float spreadP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 classCol(int c)
{
    float h = float(c) / 12.0 + hueP * 0.3;
    vec3 k = 0.5 + 0.5 * cos(6.2831853 * (h + vec3(0.0, 0.33, 0.67)));
    return mix(k, vec3(1.0), 0.3);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float spread = 0.85 + 0.35 * clamp(spreadP, 0.0, 1.0);
    float px = 1.0 / resolution.y;

    // Seen from below, slightly off axis: the crown is a flattened circle.
    vec2 c0 = vec2(0.03, 0.02);
    vec2 q = (p - c0) * vec2(1.0, 1.12);
    float r = length(q);
    float th = atan(q.y, q.x);

    // The stairwell: dark, a warm glow of the chandelier on the ceiling.
    vec3 col = vec3(0.012, 0.012, 0.02) + vec3(0.06, 0.05, 0.07) * exp(-r * 2.5);
    // The stairwell around it: the handrails of the floors above, seen from
    // below as rings getting smaller toward the skylight, each lit on its
    // inner edge by the chandelier, balusters ticking along it.
    for (int f = 0; f < 6; ++f) {
        float ff = float(f);
        float rr = 1.05 * pow(0.78, ff);
        vec2 fc = c0 + vec2(-0.05, 0.035) * ff / 5.0;           // off axis: the floors drift
        vec2 fq = (p - fc) * vec2(1.0, 1.12);
        float fr = length(fq);
        float band = smoothstep(0.012 * rr + px, 0.012 * rr - px, abs(fr - rr));
        float ang = atan(fq.y, fq.x);
        float nb = floor(110.0 * rr);
        float dd = abs(fract(ang / 6.2831853 * nb) - 0.5);
        dd = (0.5 - dd) * 6.2831853 / nb * fr;                   // distance to the nearest baluster
        float bal = smoothstep(px * 1.6 + 0.0015 * rr, 0.0, dd) * smoothstep(rr, rr + 0.005, fr) * smoothstep(rr * 1.05, rr * 1.03, fr);
        float lightK = 0.06 + 0.12 * exp(-ff * 0.3);
        col += vec3(0.9, 0.8, 0.7) * (band * lightK + bal * lightK * 0.35) * (0.7 + 0.5 * bass);
        // The dark slab of each floor outside its rail.
        col += vec3(0.5, 0.42, 0.36) * lightK * 0.25 * exp(-(fr - rr) / (0.08 * rr)) * step(rr * 1.05, fr);
    }

    // Strands in three layers, short and dense near the hub, long outside.
    float energy = 0.0;
    for (int c = 0; c < 12; ++c) energy += audioChroma[c];
    energy = clamp(energy / 6.0, 0.0, 1.0);
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float n = 70.0 + 50.0 * fl;
        float rMin = (0.13 + 0.1 * fl) * spread, rMax = (0.26 + 0.14 * fl) * spread;
        float sag = 0.35 + 0.2 * fl;                             // strands curve as they sag
        // Undo the sag so the strand is a straight ray in (r, a).
        float a = th - sag * r * r * (fl - 1.0) * 0.6;
        float gi = a / 6.2831853 * n + fl * 0.37;
        float ci = floor(gi + 0.5);
        for (int k = -1; k <= 1; ++k) {
            float id = ci + float(k);
            float hs = hash21(vec2(mod(id, n), fl * 5.0 + 1.0));
            float aC = (id + 0.3 * (hs - 0.5) - fl * 0.37) / n * 6.2831853;
            float len = mix(rMin, rMax, hash21(vec2(mod(id, n), fl * 5.0 + 2.0)));
            float da = a - aC;
            da -= 6.2831853 * floor(da / 6.2831853 + 0.5);
            float dist = abs(da) * r;                            // distance to the strand
            int cls = int(mod(mod(id, n) + fl * 5.0, 12.0));
            float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
            vec3 cc = classCol(cls);
            // The glass strand: faint, lit by its own light.
            if (r < len) {
                float w = 0.0012 + px * 0.7;
                float core = exp(-dist * dist / (w * w)) * smoothstep(0.03, 0.08, r);
                // Pulses running outward.
                float ph = fract(T * (0.08 + 0.05 * hs) + hs * 7.0);
                float pr = ph * len * 1.3;
                float pulse = exp(-pow((r - pr) / 0.02, 2.0));
                col += cc * core * (0.05 + 0.15 * e + pulse * (0.2 + 1.5 * e));
            }
            // The tip: a round point of light with a soft halo.
            vec2 tip = vec2(cos(aC), sin(aC)) * len;
            // Re-apply the sag to place the tip where the strand ends.
            float tA = aC + sag * len * len * (fl - 1.0) * 0.6;
            tip = vec2(cos(tA), sin(tA)) * len;
            float dt = length(q - tip);
            float tipR = 0.0035 + 0.0015 * (1.0 - fl * 0.3);
            col += cc * (smoothstep(tipR + px, tipR - px, dt) * (0.3 + 1.6 * e) + exp(-dt * 90.0) * (0.08 + 0.5 * e));
        }
    }
    // The hub: a glowing knot of glass where all strands meet.
    col += vec3(1.0, 0.92, 0.8) * (exp(-r * 40.0) * 1.2 + exp(-r * 12.0) * 0.25) * (0.7 + 0.6 * bass);
    col += imgPalette(0.3 + hueP * 0.159) * exp(-r * 6.0) * 0.06 * (0.5 + energy);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
