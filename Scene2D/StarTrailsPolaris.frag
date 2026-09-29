#version 330 core
out vec4 fragColor;
/**
 * @file StarTrailsPolaris.frag
 * @brief STAR TRAILS POLARIS: a long-exposure night photograph come alive --
 * above a dark landscape, hundreds of stars drawn into concentric arcs
 * around the pole star, white, blue and amber, each trail the same length
 * of the night, the whole sky turning about Polaris at a steady pace.  On
 * the ground a rock arch stands in silhouette against the faint glow of a
 * distant town, and a small tent glows orange under it.  The rings of
 * trails brighten with the bands of the music.  The camera is still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the brightness of the trails, ring by ring (light)
 *   audioSwell        -> the glow of the tent and the horizon (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the sky turning (constant speed)
 *
 * Per-activation variety: trailP (how long the trails), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float trailP;
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
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float band[8];
    for (int i = 0; i < 8; ++i)
        band[i] = clamp((audioSpectrum[i * 4] + audioSpectrum[i * 4 + 1] + audioSpectrum[i * 4 + 2] + audioSpectrum[i * 4 + 3]) * (0.35 + 0.1 * float(i)), 0.0, 1.0);
    float px = 1.0 / resolution.y;

    // Night sky: deep blue, the glow of a town low on the horizon.
    float hz = -0.28;
    vec3 col = mix(vec3(0.03, 0.04, 0.1), vec3(0.01, 0.015, 0.04), smoothstep(hz, 0.5, p.y));
    col += vec3(0.35, 0.22, 0.12) * exp(-(p.y - hz) * 7.0) * exp(-abs(p.x + 0.4) * 1.5) * (0.5 + 0.4 * swell);

    // The trails: concentric arcs around the pole.
    vec2 pole = vec2(0.18, 0.3);
    vec2 d = p - pole;
    float r = length(d);
    float th = atan(d.y, d.x);
    float L = 0.6 + 0.9 * clamp(trailP, 0.0, 1.0);          // arc length (radians)
    float omega = 0.012;                                     // how fast the sky turns
    const float RS = 0.0065;                                 // ring spacing
    float ri = floor(r / RS);
    vec3 trails = vec3(0.0);
    for (int k = -1; k <= 1; ++k) {
        float ring = ri + float(k);
        if (ring < 1.0) continue;
        float n = 1.0 + floor(ring * 0.055);                   // stars per ring grow with radius
        for (int s = 0; s < 8; ++s) {
            if (float(s) >= n) break;
            vec2 id = vec2(ring, float(s));
            float rs = (ring + 0.2 + 0.6 * hash21(id)) * RS;
            float head = hash21(id + 3.0) * 6.2831853 + omega * T;
            float da = mod(head - th, 6.2831853);            // how far behind the head
            float mag = hash21(id + 5.0);
            if (mag < 0.4) continue;                          // many faint stars do not register
            float w = 0.0009 + 0.0012 * mag * mag + px * 0.6;
            float line = exp(-pow((r - rs) / w, 2.0));
            float along = step(da, L) * smoothstep(L, L - 0.05, da) * smoothstep(0.0, 0.01, da + 0.005);
            // Star colours: blue-white, white, amber.
            float c = hash21(id + 7.0);
            vec3 sc = (c < 0.3) ? vec3(0.7, 0.8, 1.0) : (c < 0.75) ? vec3(1.0, 0.97, 0.92) : vec3(1.0, 0.75, 0.45);
            float b = band[int(mod(ring, 8.0))];
            trails += sc * line * along * (0.2 + 0.8 * mag * mag * mag) * (0.5 + 0.9 * b);
        }
    }
    col += trails * smoothstep(hz, hz + 0.05, p.y);
    // Polaris itself, a bright point at the centre.
    col += vec3(1.0, 0.97, 0.9) * exp(-r * r / 0.00002);

    // The landscape: rolling ground and a rock arch, in silhouette.
    float ground = hz + 0.03 * fbm(vec2(p.x * 3.0, 1.0)) + 0.02 * sin(p.x * 1.4);
    vec2 aq = p - vec2(-0.35, hz);
    float archOut = length(aq * vec2(0.85, 1.0 + 0.3 * smoothstep(0.0, 0.3, aq.x))) - 0.27;
    float archIn = length((aq - vec2(0.02, -0.03)) * vec2(1.0, 0.8)) - 0.17;
    float arch = max(archOut + 0.025 * (fbm(aq * 12.0) - 0.5), -archIn + 0.02 * (fbm(aq * 10.0 + 3.0) - 0.5));
    arch = max(arch, -aq.y);
    float sil = max(smoothstep(px, -px, p.y - ground), smoothstep(px * 1.5, -px * 1.5, arch));
    vec3 land = vec3(0.012, 0.012, 0.02);
    // Faint rim light from the sky on the arch.
    land += vec3(0.05, 0.05, 0.08) * smoothstep(-0.01, 0.0, arch) * step(arch, 0.0);
    col = mix(col, land, sil);
    // The tent under the arch, glowing from within.
    {
        vec2 tq = p - vec2(-0.33, hz + 0.005);
        float tent = max(abs(tq.x) * 1.4 + tq.y - 0.045, -tq.y);
        float inT = smoothstep(px, -px, tent);
        vec3 tc = vec3(1.0, 0.55, 0.2) * (0.7 + 0.5 * swell) * (0.8 + 0.4 * smoothstep(0.045, 0.0, tq.y));
        tc = mix(tc, tc * imgPalette(0.08 + hueP * 0.159) * 1.3, 0.1);
        col = mix(col, tc, inT);
        col += vec3(1.0, 0.5, 0.2) * exp(-length(tq * vec2(1.0, 1.6)) * 22.0) * 0.25 * (0.6 + 0.5 * swell);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
