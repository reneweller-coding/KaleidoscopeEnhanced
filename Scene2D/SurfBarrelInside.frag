#version 330 core
out vec4 fragColor;
/**
 * @file SurfBarrelInside.frag
 * @brief SURF BARREL INSIDE: riding deep inside the barrel of a breaking wave
 * -- the water curls from the wave face on the right, up over your head and
 * down in a falling curtain on the left, a tunnel of glassy turquoise, and
 * ahead the round opening where the tube ends shows the blinding sky and
 * the bright beach.  Sunlight shines through the thin lip overhead, so the
 * water glows green-gold there and darkens to deep teal where it is
 * thick; streaks of foam and bubbles stream around the tube as the water
 * spins, spray hangs in the air.  The ride goes on endlessly and evenly.
 *
 * Audio Reactivity:
 *   audioSwell  -> the light through the lip (slow)
 *   audioHigh   -> glitter in the spray (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the water spinning around the tube (continuous)
 *
 * Per-activation variety: tubeP (how round the tube), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float tubeP;
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
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
float hash31(vec3 p)
{
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Noise around the tube: periodic in the angle, so the spin has no seam.
float tubeNoise(float u, float z, float k)
{
    vec3 q = vec3(cos(u) * k, sin(u) * k, z);
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise3(q); q = q * 2.03 + 1.7; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;

    // The tube's axis runs ahead to the opening, a little left of centre.
    vec2 c = vec2(-0.1, 0.03);
    vec2 d = p - c;
    d.x *= 0.8 + 0.3 * clamp(tubeP, 0.0, 1.0);               // oval or round
    float r = length(d);
    float a = atan(d.y, d.x);                                 // 0 right, pi/2 up
    // The opening: the lip hangs lower on the left, the face rises on the right.
    float rOpen = 0.2 + 0.03 * sin(a + 0.5) + 0.02 * (tubeNoise(a, 0.0, 1.0) - 0.5);
    float z = -log(max(r, 0.02)) * 3.0;                        // depth into the tube (even in log radius)
    float spin = a + T * 0.25;                                // the water rotating around the tube

    // Beyond the opening: the sky and the bright beach.
    vec3 outside = mix(vec3(1.0, 0.98, 0.9), vec3(0.6, 0.8, 1.0), smoothstep(-0.02, 0.15, p.y - c.y));
    outside = mix(outside, vec3(0.95, 0.88, 0.7), smoothstep(-0.01, -0.04, p.y - c.y));
    outside *= 1.6;

    // The water wall: thin and glowing near the lip (up and left), thick and
    // dark on the face at the lower right.
    float thin = smoothstep(-0.7, 0.9, sin(a - 0.35));
    vec3 thick = vec3(0.04, 0.24, 0.28);
    vec3 glow = mix(vec3(0.2, 0.8, 0.68), vec3(0.85, 1.0, 0.6), smoothstep(0.6, 1.0, thin)) * (0.95 + 0.5 * swell);
    glow = mix(glow, glow * imgPalette(0.45 + hueP * 0.159) * 1.4, 0.08);
    vec3 water = mix(thick, glow, thin * (0.35 + 0.65 * smoothstep(0.2, 0.7, r)));
    // Streaks wrap around the tube with the flow; foam lines ride on them.
    float streak = tubeNoise(spin, z * 3.0, 0.7);
    float band = tubeNoise(spin + 1.3, z * 2.2, 1.1);
    water *= 0.7 + 0.5 * streak;
    float foam = smoothstep(0.6, 0.7, band);
    water = mix(water, vec3(0.88, 0.97, 1.0) * (0.55 + 0.45 * thin), foam * 0.55);
    // Near the opening the water is lit brightest, a glassy rim.
    water += vec3(0.7, 0.95, 0.85) * exp(-(r - rOpen) * 10.0) * 0.45;
    // The opening's lower part is the sea surface ahead, bright with the sky.
    float seaLine = c.y - 0.06 + 0.01 * sin(p.x * 20.0 + T * 0.5);
    float inOpen = smoothstep(rOpen + 0.006, rOpen - 0.004, r);
    vec3 sea = mix(vec3(0.5, 0.8, 0.8), vec3(0.9, 0.97, 1.0), noise2(vec2(p.x * 40.0, p.y * 90.0 - T)));
    outside = mix(outside, sea * 1.2, smoothstep(seaLine + 0.004, seaLine - 0.004, p.y));
    vec3 col = mix(water, outside, inOpen);

    // Spray and droplets hanging in the tube: round, glittering, drifting out.
    {
        vec2 g = p * 50.0 + vec2(-T * 0.5, T * 0.2), gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        float tw = 0.5 + 0.5 * sin(T * 3.0 + hash21(gi + 7.0) * 40.0);
        float drop = smoothstep(0.12, 0.0, length(gf - gc)) * step(0.88, hash21(gi + 5.0));
        col += vec3(1.0) * drop * tw * (0.2 + 0.9 * hi) * smoothstep(rOpen, rOpen + 0.2, r) * (0.4 + 0.6 * thin);
    }
    // A soft mist glows around the opening.
    col += vec3(0.9, 0.95, 0.9) * exp(-abs(r - rOpen) * 18.0) * 0.25 * (0.7 + 0.5 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
