#version 330 core
out vec4 fragColor;
/**
 * @file DiscoFloorTiles.frag
 * @brief DISCO FLOOR TILES: a lit dance floor seen from a low angle, glass
 * tiles glowing from beneath, running away into a dark club with a mirror
 * ceiling that repeats the floor overhead.  Every tile column is a
 * spectrum band and each tile lights by how high that band reaches -- the
 * floor is an equaliser you could dance on -- and the kick pulses the
 * whole grid.  Haze hangs over it and catches the glow.  Nothing moves but
 * the light; the camera drifts very slowly along the floor.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> tile columns light up to the band's level (light)
 *   audioKick         -> a pulse through the whole floor (light)
 *   audioSwell        -> haze over the floor (slow)
 *   sceneAdvance      -> the slow drift along the floor (continuous)
 *
 * Per-activation variety: patternP (equaliser or checker mix), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float patternP;
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

vec3 hueRot(vec3 c, float a)
{
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec3 hsv(float h, float s, float v)
{
    vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    return v * mix(vec3(1.0), k, s);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float g_hue, g_pat, g_drift;

// Emission of the floor at world (x, z): tiles 1 m, grout between.
vec3 floorGlow(vec2 w)
{
    vec2 ti = floor(w), tf = fract(w);
    float grout = smoothstep(0.0, 0.06, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)));
    // Equaliser: the column (x) picks the band, the row counted from the
    // camera end (z) is the level the band must reach.
    float colIdx = mod(ti.x + 16.0, 32.0);
    int band = int(colIdx);
    float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
    float row = mod(ti.y, 8.0);
    float eq = smoothstep(row / 8.0 - 0.05, row / 8.0 + 0.05, e);
    float chk = mod(ti.x + ti.y, 2.0) * (0.35 + 0.65 * noise2(vec2(ti.x * 0.3, ti.y * 0.3 + sceneTime * 0.2)));
    float on = mix(eq, chk, g_pat * 0.6) * 0.6 + 0.4;
    // Tile colour: a disco floor is gel colours by nature (documented
    // rainbow identity, V8b) -- a hue per column group, nudged by the
    // photo's key so each activation has its own colour scheme.
    vec3 photoC = imgPalette(g_hue * 0.159 + 0.2);
    float h = g_hue * 0.159 + mod(ti.x, 6.0) / 6.0 + dot(photoC, vec3(0.1));
    vec3 c = hsv(h, 0.85, 1.0);
    // Diffuser: brighter in the middle of each tile.
    float diff = 0.7 + 0.3 * (1.0 - length(tf - 0.5) * 1.4);
    float kick = clamp(audioKick, 0.0, 2.0);
    return c * on * grout * diff * (0.9 + 0.5 * kick);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    g_hue = (hueP > 0.001) ? hueP : 0.0;
    g_pat = clamp(patternP, 0.0, 1.0);
    g_drift = sceneAdvance * 0.12 + sceneTime * 0.05;
    float swell = clamp(audioSwell, 0.0, 1.0);

    vec3 ro = vec3(0.3, 1.6, g_drift);
    vec3 rd = normalize(vec3(p.x, p.y - 0.46, 1.0));
    const float CEIL = 3.4;

    vec3 col = vec3(0.0);
    float tHit = 40.0;
    if (rd.y < 0.0)
    {
        float t = -ro.y / rd.y;
        vec3 w = ro + rd * t;
        col = floorGlow(w.xz) * exp(-t * 0.06);
        // Glass sheen: the room's darkness reflected, faint highlight.
        col += vec3(0.02) * pow(1.0 + rd.y, 8.0);
        tHit = t;
    }
    else
    {
        // Mirror ceiling: the floor seen again overhead, darker.
        float t = (CEIL - ro.y) / rd.y;
        vec3 w = ro + rd * t;
        float t2 = t + CEIL / rd.y;                  // ray continues down to the floor image
        vec3 w2 = ro + rd * t2;
        col = floorGlow(vec2(w2.x, w2.z)) * 0.6 * exp(-t2 * 0.05);
        vec2 pan = fract(w.xz * 0.5);
        col *= smoothstep(0.0, 0.03, min(min(pan.x, 1.0 - pan.x), min(pan.y, 1.0 - pan.y)));
        tHit = t;
    }

    // Haze: the glow of the floor hanging in the air above it.
    vec3 hazeC = floorGlow(vec2(ro.x + rd.x * 6.0, ro.z + 6.0)) * 0.0;
    float hz = 0.0;
    for (int i = 0; i < 10; ++i)
    {
        float tt = (float(i) + 0.5) / 10.0 * min(tHit, 18.0);
        vec3 x = ro + rd * tt;
        float h = exp(-x.y * 1.6);
        vec3 below = floorGlow(x.xz);
        hazeC += below * h * 0.1;
        hz += h * 0.1;
    }
    col += hazeC * (0.25 + 0.5 * swell) * 0.6;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
