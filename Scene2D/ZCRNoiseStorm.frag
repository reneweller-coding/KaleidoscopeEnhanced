#version 330 core
out vec4 fragColor;
/**
 * @file ZCRNoiseStorm.frag
 * @brief ZCR NOISE STORM: a sandstorm tunnel whose grain IS the noise in
 * the music.  The zero-crossing rate and the spectral flatness -- how much
 * of the sound is hiss, breath, cymbal wash -- set the density and
 * contrast of the sand streaming past, so a clean tone flies through
 * clear air and a noisy passage through a wall of grit.  Streaks run down
 * the tunnel on the music's pace; a light burns ahead.  The camera never
 * moves.
 *
 * Audio Reactivity:
 *   audioZCR       -> grain density (light/texture)
 *   audioFlatness  -> grain contrast (light/texture)
 *   sceneAdvance   -> streaks fly past (continuous)
 *   audioSwell     -> the light ahead brightens (slow)
 *   audioKick      -> a gust of brightness (light)
 *   audioLevel     -> overall
 *
 * Per-activation variety: grainP (base grain), speedP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioZCR;
uniform float audioFlatness;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float grainP;
uniform float speedP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float zcr  = clamp(audioZCR * 2.0, 0.0, 1.0);
    // (flatn, not flat: flat is a reserved interpolation qualifier in GLSL)
    float flatn = clamp(audioFlatness * 2.0, 0.0, 1.0);
    float grain = (0.3 + 0.5 * clamp(grainP, 0.0, 1.0)) * (0.4 + 0.6 * zcr);
    float travel = sceneAdvance * 2.2 * (speedP > 0.05 ? speedP : 1.0) + sceneTime * 0.4;

    float r = length(p);
    float a = atan(p.y, p.x);
    float depth = 1.0 / max(r, 0.02);
    float z = depth + travel;

    // Tunnel wall: dunes of sand, the photo as the rock beneath.
    vec2 uv = vec2(fract(a * 0.15915494 * 2.0), fract(z * 0.08));
    vec3 rock = img(uv) * imgPalette(hue * 0.159 + 0.12) * 1.4;
    float dune = 0.5 + 0.5 * sin(a * 6.0 + z * 0.4);
    rock *= 0.5 + 0.5 * dune;

    // Sand streaks: elongated along z, streaming with the travel; their
    // density is the ZCR, their contrast the flatness.
    float streak = 0.0;
    for (int i = 0; i < 3; ++i)
    {
        float fi = float(i);
        float sc = 6.0 + fi * 5.0;
        float n = noise2(vec2(a * sc, z * (0.6 + fi * 0.3) * 3.0 + fi * 7.0));
        streak += pow(n, 2.0 + 3.0 * (1.0 - flatn)) * (1.0 - fi * 0.25);
    }
    streak *= grain * 1.6;
    // Fine grit: high-frequency grain that flickers like a real storm but
    // only in brightness, never in geometry.
    // Grit: round grains jittered in their cells (a lit cell is a square
    // pixel, rule V8e).
    vec2 gc = vec2(a * 200.0, z * 60.0);
    vec2 gcell = floor(gc);
    vec2 goff = vec2(hash21(gcell + 3.1), hash21(gcell + 7.7)) - 0.5;
    vec2 gf = fract(gc) - 0.5 - goff * 0.5;
    float grit = smoothstep(0.25, 0.05, length(gf)) * step(1.0 - 0.4 * grain, hash21(gcell));

    vec3 sandCol = imgPalette(hue * 0.159 + 0.1) * 0.9 + vec3(0.25, 0.18, 0.08);
    vec3 col = rock * (0.25 + 0.4 * audioLevel);
    col = mix(col, sandCol * (0.6 + 0.6 * audioLevel), clamp(streak, 0.0, 1.0));
    col += sandCol * grit * 0.6;

    // Light ahead: it brightens on builds and gusts on the kick, and the
    // sand scatters it (fog whose density is the grain).
    float fogD = 0.05 + 0.12 * grain;
    float fog = 1.0 - exp(-depth * fogD);
    vec3 glowCol = mix(imgPalette(hue * 0.159 + 0.9), vec3(1.0, 0.9, 0.7), 0.5);
    float ahead = exp(-r * 5.0) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0) + 0.6 * audioKick);
    col = mix(col, sandCol * 0.35 * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)), clamp(fog, 0.0, 0.9));
    col += glowCol * ahead;
    col *= 1.0 - 0.3 * smoothstep(0.7, 1.15, r);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
