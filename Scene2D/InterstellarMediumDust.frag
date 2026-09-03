#version 330 core
out vec4 fragColor;
/**
 * @file InterstellarMediumDust.frag
 * @brief INTERSTELLAR MEDIUM DUST: a volumetric dust cloud between the stars,
 * ray-marched as real density -- stars behind it dim by the integrated
 * column they shine through, not by a painted glow, so the cloud has a
 * front and a back.  The density field is fbm advected by a curl-noise flow
 * (domain warping on the scene clock: the cloud folds and drifts without a
 * simulation and without a jump).  The bass thickens the cloud (slow,
 * through the swell); a nearby star inside the cloud lights it on the kick.
 * The camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the cloud's flow (continuous)
 *   audioSwell   -> cloud density (slow)
 *   audioKick    -> the embedded star flashes (light)
 *   audioLevel   -> star brightness
 *   audioChromaHue -> cloud tint via the palette
 *
 * Per-activation variety: densP (base density), scaleP (cloud scale), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
uniform float scaleP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x)
{
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p)
{
    float v = 0.0, a = 0.5;
    mat3 R = mat3(0.8, 0.6, 0.0, -0.6, 0.8, 0.0, 0.0, 0.0, 1.0) * mat3(1.0, 0.0, 0.0, 0.0, 0.8, 0.6, 0.0, -0.6, 0.8);
    for (int i = 0; i < 4; ++i) { v += a * noise3(p); p = R * p * 2.05 + 3.7; a *= 0.5; }
    return v;
}

// Density at a point: fbm advected by a slow curl-like warp on the scene clock.
float density(vec3 q, float t, float base)
{
    vec3 warp = vec3(noise3(q * 0.35 + vec3(t * 0.11, 0.0, 0.0)), noise3(q * 0.35 + vec3(0.0, t * 0.09, 7.0)), noise3(q * 0.35 + vec3(3.0, 0.0, t * 0.07))) - 0.5;
    vec3 qq = q + warp * 2.2 + vec3(t * 0.15, 0.0, 0.0);
    float d = fbm(qq * 0.55);
    return clamp((d - 0.42) * 2.5 * base, 0.0, 1.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue  = (hueP > 0.001) ? hueP : 0.0;
    float base = (0.7 + 0.6 * clamp(densP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float sc   = 0.8 + 0.5 * clamp(scaleP, 0.0, 1.0);
    float t    = sceneAdvance * 0.5 + sceneTime * 0.1;

    vec3 ro = vec3(0.0, 0.0, 0.0);
    vec3 rd = normalize(vec3(p.x, p.y, 1.3));

    // Background stars (behind the cloud): a jittered round star field.
    vec2 sk = rd.xy / rd.z;
    vec2 su = sk * 60.0;
    vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
    float hs = hash13(vec3(cell, 1.0));
    vec2 off = vec2(hash13(vec3(cell, 2.0)), hash13(vec3(cell, 3.0))) - 0.5;
    float star = smoothstep(0.12, 0.0, length(f - off * 0.6)) * step(0.975, hs) * (0.5 + 0.8 * hash13(vec3(cell, 4.0)));
    vec3 bg = vec3(star) * 0.9 + imgPalette(hue * 0.159 + 0.6) * 0.015;

    // Embedded star: a point inside the cloud, lighting it.
    vec3 starPos = vec3(1.5, 0.6, 7.0);
    vec3 starCol = mix(imgPalette(hue * 0.159 + 0.05), vec3(1.0, 0.95, 0.85), 0.5) * (0.6 + 0.6 * audioLevel) * (1.0 + 2.0 * audioKick);

    // March through the cloud volume z in [3, 14]: accumulate transmittance
    // and in-scattered light from the embedded star and the palette ambient.
    vec3 col = vec3(0.0);
    float trans = 1.0;
    const int STEPS = 40;
    float t0 = 3.0, t1 = 14.0;
    float dt = (t1 - t0) / float(STEPS);
    vec3 dustCol = imgPalette(hue * 0.159 + 0.55);
    for (int i = 0; i < STEPS; ++i)
    {
        float tt = t0 + (float(i) + 0.5) * dt;
        vec3 q = ro + rd * tt;
        float d = density(q * sc, t, base);
        if (d < 0.005) continue;
        vec3 toStar = starPos - q;
        float dist2 = dot(toStar, toStar);
        float lit = 3.0 / (dist2 + 0.8);
        vec3 scatter = dustCol * (0.05 + 0.35 * lit) + starCol * lit * 0.25;
        float absorb = d * dt * 0.9;
        col += scatter * absorb * trans;
        trans *= exp(-absorb);
        if (trans < 0.01) break;
    }
    // The star itself, seen through the cloud in front of it.
    vec3 toS = normalize(starPos - ro);
    float sCore = exp(-acos(clamp(dot(rd, toS), -1.0, 1.0)) * 60.0);
    // Transmittance up to the star's depth: re-march coarsely.
    float transStar = 1.0;
    for (int i = 0; i < 12; ++i)
    {
        float tt = t0 + (float(i) + 0.5) * (7.0 - t0) / 12.0;
        transStar *= exp(-density((ro + toS * tt) * sc, t, base) * (7.0 - t0) / 12.0 * 0.9);
    }
    col += starCol * sCore * 2.0 * transStar;
    col += bg * trans;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
