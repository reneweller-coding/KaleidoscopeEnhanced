#version 330 core
out vec4 fragColor;
/**
 * @file DarkNebulaBokGlobules.frag
 * @brief DARK NEBULA / BOK GLOBULES: cocoons of dust in silhouette before a
 * glowing emission nebula -- the photo IS the nebula.  The globules are a
 * ray-marched density field (fbm blobs, domain-warped on the scene clock),
 * and the nebula and the stars behind them dim by the integrated column,
 * so the cocoons have a front, a back and soft edges where the dust thins.
 * The swell thickens the dust (slow); onsets ignite protostars deep inside
 * the cocoons, which then glow through the dust as reddened points -- light,
 * never motion.  The camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the dust drifts and folds (continuous)
 *   audioSwell   -> dust density (slow)
 *   audioOnset   -> protostars ignite inside the globules (light)
 *   audioLevel   -> nebula brightness
 *   audioKick    -> the nebula's rim glow pulses (light)
 *
 * Per-activation variety: densP, globP (globule count/scale), hueP.
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
uniform float audioOnset;
uniform float audioLevel;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
uniform float globP;
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
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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

// Globule centres: a handful of cocoons, each drifting slowly.
vec3 globCentre(int k, float t)
{
    float fk = float(k);
    return vec3((hash11(fk * 3.1) - 0.5) * 3.2 + 0.25 * sin(t * 0.07 + fk),
                (hash11(fk * 5.3) - 0.5) * 1.8 + 0.2 * cos(t * 0.05 + fk * 1.7),
                5.0 + hash11(fk * 7.7) * 4.0);
}

float density(vec3 q, float t, float base, int nGlob)
{
    float d = 0.0;
    for (int k = 0; k < 6; ++k)
    {
        if (k >= nGlob) break;
        vec3 c = globCentre(k, t);
        float rr = 0.9 + 0.7 * hash11(float(k) * 9.1);
        vec3 dq = (q - c) / rr;
        float core = exp(-dot(dq, dq) * 1.6);
        float wisp = fbm(q * 1.1 + vec3(t * 0.05, 0.0, 0.0) + float(k));
        d += core * (0.55 + 0.9 * wisp);
    }
    return clamp(d * base, 0.0, 1.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue  = (hueP > 0.001) ? hueP : 0.0;
    float base = (1.3 + 0.8 * clamp(densP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    int nGlob  = 3 + int(clamp(globP, 0.0, 1.0) * 3.0);
    float t = sceneAdvance * 0.5 + sceneTime * 0.1;

    vec3 ro = vec3(0.0);
    vec3 rd = normalize(vec3(p.x, p.y, 1.3));

    // The nebula behind everything: the photo, glowing, with a slow drift and
    // a rim pulse on the kick; stars as round jittered points.
    vec2 nuv = fract(vec2(p.x * 0.35 + 0.5 + sceneAdvance * 0.004, p.y * 0.5 + 0.5));
    // The nebula: the photo as glowing gas, mottled by fbm so it reads as
    // gas and not as a flat picture.
    float gasMot = 0.5 + 0.9 * fbm(vec3(p * 2.5, sceneAdvance * 0.02));
    vec3 neb = img(nuv) * imgPalette(hue * 0.159 + 0.05) * 4.5 * gasMot * (0.7 + 0.6 * audioLevel) + imgPalette(hue * 0.159 + 0.05) * 0.25;
    neb += imgPalette(hue * 0.159 + 0.9) * 0.15 * audioKick;
    vec2 su = p * 70.0;
    vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
    float hs = hash13(vec3(cell, 1.0));
    vec2 off = vec2(hash13(vec3(cell, 2.0)), hash13(vec3(cell, 3.0))) - 0.5;
    float star = smoothstep(0.14, 0.02, length(f - off * 0.6)) * step(0.975, hs) * (0.5 + 0.8 * hash13(vec3(cell, 4.0)));
    vec3 bg = neb + vec3(star) * 1.2;

    // March the dust: transmittance, and protostars lit inside on the onset.
    float trans = 1.0;
    vec3 col = vec3(0.0);
    const int STEPS = 36;
    float t0 = 3.0, t1 = 10.5;
    float dt = (t1 - t0) / float(STEPS);
    float onset = clamp(audioOnset, 0.0, 1.0);
    vec3 dustCol = imgPalette(hue * 0.159 + 0.6) * 0.06;
    vec3 protoCol = vec3(1.0, 0.45, 0.2) * 3.0;
    for (int i = 0; i < STEPS; ++i)
    {
        float tt = t0 + (float(i) + 0.5) * dt;
        vec3 q = ro + rd * tt;
        float d = density(q, t, base, nGlob);
        if (d < 0.004) continue;
        // Protostars: one per globule, deep inside; they glow through the dust
        // as reddened points, brighter on the onset.
        vec3 lit = vec3(0.0);
        for (int k = 0; k < 6; ++k)
        {
            if (k >= nGlob) break;
            vec3 c = globCentre(k, t);
            float dd = dot(q - c, q - c);
            float fam = step(0.35, hash11(float(k) * 2.2));
            lit += protoCol * exp(-dd * 6.0) * (0.15 + 1.2 * onset * fam);
        }
        float absorb = d * dt * 1.8;
        col += (dustCol + lit * d) * absorb * trans;
        trans *= exp(-absorb);
        if (trans < 0.01) break;
    }
    col += bg * trans;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
