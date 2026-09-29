#version 330 core
out vec4 fragColor;
/**
 * @file WhirlingDervishes.frag
 * @brief WHIRLING DERVISHES: the sema seen as a long-exposure photograph
 * from above.  A circle of turning dancers, each a white skirt blurred into
 * a luminous disc with soft folds, the whole ring itself slowly circling a
 * centre; warm lamplight from above, the floor dark wood.  The dancers turn
 * at their own steady speed; the music is in the light -- each skirt glows
 * with its band, and the swell brightens the lamps.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> each skirt's glow (its band)
 *   audioSwell        -> the lamplight (slow)
 *   audioHigh         -> sparkle on the skirt hems (light)
 *   sceneTime         -> the turning of skirts and ring (continuous, constant)
 *
 * Per-activation variety: dancersP (how many dancers), hueP.
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
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float dancersP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    int nD = 7 + int(clamp(dancersP, 0.0, 1.0) * 5.99);

    // Floor: dark polished wood (the photo), lit by warm lamps.
    vec3 lampC = mix(vec3(1.0, 0.78, 0.5), imgPalette(hue * 0.159 + 0.08), 0.2);
    vec2 wq = vec2(p.x * 2.0, p.y * 18.0);
    vec3 wood = img(fract(vec2(p.x * 0.3, p.y * 0.3) + 0.2)) * vec3(0.35, 0.22, 0.12);
    wood *= 0.7 + 0.3 * noise2(wq) + 0.1 * step(0.95, fract(p.y * 9.0));
    float lamps = 0.6 + 0.9 * exp(-dot(p, p) * 1.2);
    vec3 col = wood * lampC * lamps * (0.5 + 0.5 * swell);

    // The ring of dancers.
    float ringR = 0.34;
    float ringA = sceneTime * 0.05;
    for (int k = 0; k < 12; ++k)
    {
        if (k >= nD) break;
        float fk = float(k);
        float a = ringA + fk / float(nD) * 6.2831853;
        vec2 c = vec2(cos(a), sin(a)) * ringR * vec2(1.25, 1.0);
        float sk = 0.11 + 0.02 * hash11(fk);           // skirt radius
        vec2 d = p - c;
        float r = length(d) / sk;
        if (r > 1.25) continue;
        // The skirt: a luminous disc with folds swept round by the spin
        // (the long exposure blurs them into spiral streaks).
        float ang = atan(d.y, d.x);
        float spin = sceneTime * (2.2 + 0.4 * hash11(fk + 3.0));
        // Radial pleats, only slightly swept by the spin (the exposure).
        float folds = 0.5 + 0.5 * cos((ang + r * 0.5 - spin) * 16.0);
        folds = mix(folds, 0.5, 0.35);
        int band = int(mod(fk * 4.0 + 1.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        vec3 cloth = mix(vec3(0.97, 0.96, 0.94), imgPalette(hue * 0.159 + fk * 0.05) * 1.3, 0.06);
        float disc = smoothstep(1.0, 0.9, r);
        float lum = (0.55 + 0.25 * folds) * (0.7 + 0.25 * r) * (0.75 + 0.6 * e);
        vec3 skirt = cloth * lum * mix(vec3(1.0), lampC, 0.35);
        // The hem: a brighter ring with sparkle.
        float hem = exp(-abs(r - 0.97) * 40.0);
        skirt += cloth * hem * (0.35 + 0.8 * hi * noise2(vec2(ang * 10.0 + spin, fk)));
        // Head and shoulders: the tall felt hat seen from above, dark.
        float head = smoothstep(0.2, 0.15, r);
        skirt = mix(skirt, vec3(0.12, 0.08, 0.06), head);
        // Motion halo: the exposure smears light outside the disc.
        col += cloth * lampC * exp(-max(r - 1.0, 0.0) * 12.0) * (1.0 - disc) * 0.25 * (0.6 + e);
        col = mix(col, skirt, disc);
        // Soft shadow on the floor, down-right.
        vec2 sd = (p - c - vec2(0.02, -0.02)) / sk;
        col *= 1.0 - 0.35 * smoothstep(1.2, 0.8, length(sd)) * (1.0 - disc);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
