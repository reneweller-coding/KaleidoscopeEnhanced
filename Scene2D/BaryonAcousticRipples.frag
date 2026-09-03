#version 330 core
out vec4 fragColor;
/**
 * @file BaryonAcousticRipples.frag
 * @brief BARYON ACOUSTIC RIPPLES: the sound waves of the early universe,
 * frozen into the galaxy distribution as faint rings of one fixed scale
 * around every overdensity.  Galaxies are round dots of the photo, denser
 * on the shells; the whole pattern expands steadily over the scene arc
 * (the universe growing), the shells light with their spectrum band, and
 * the bass breathes the cosmic web between them.  Literally acoustic: the
 * ring scale is the sound horizon.  Camera still.
 *
 * Audio Reactivity:
 *   sceneProgress     -> expansion (the arc, continuous)
 *   sceneAdvance      -> slow drift (continuous)
 *   audioSpectrum[32] -> shell glow per ring (light)
 *   audioBass         -> web glow (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: seedsP (number of overdensities), scaleP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float seedsP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nSeeds = 4 + int(clamp(seedsP, 0.0, 1.0) * 5.0);
    float horizon = (0.22 + 0.12 * clamp(scaleP, 0.0, 1.0));
    // Expansion: the comoving pattern grows over the arc, drifting slowly.
    float expand = 1.0 + 0.9 * clamp(sceneProgress, 0.0, 1.0);
    vec2 q = p / expand + vec2(sceneAdvance * 0.004, 0.0);

    // Density field: the cosmic web (fbm) plus the BAO shells around seeds.
    float web = fbm(q * 4.0 + 3.0);
    float shells = 0.0; vec3 shellCol = vec3(0.0);
    for (int i = 0; i < 9; ++i)
    {
        if (i >= nSeeds) break;
        float fi = float(i);
        vec2 c = vec2((hash11(fi * 3.7) - 0.5) * 1.4, (hash11(fi * 5.3) - 0.5) * 0.9);
        float r = length(q - c);
        float ring = exp(-pow((r - horizon) / 0.022, 2.0));
        float core = exp(-r * r / 0.004);
        int band = int(mod(fi * 4.0 + 2.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        shells += ring * (0.5 + 0.5 * e) + core * 0.8;
        shellCol += imgPalette(hue * 0.159 + fi * 0.11) * ring * e;
    }
    float density = clamp(web * 0.9 + shells * 0.9, 0.0, 2.0);

    // Galaxies: round dots whose presence follows the density.
    vec3 col = vec3(0.0);
    float scale = 70.0 * expand;
    for (int layer = 0; layer < 2; ++layer)
    {
        vec2 gu = q * scale * (1.0 + 0.5 * float(layer)) + float(layer) * 17.0;
        vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
        vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        float h = hash21(cell);
        float present = step(1.0 - clamp(density, 0.0, 1.0) * 0.8 - 0.06, h);
        float d = length(f - off * 0.6);
        float sz = 0.08 + 0.14 * hash21(cell + 9.9);
        float dot_ = smoothstep(sz, sz * 0.3, d) * present;
        vec3 gc = img(fract(cell * 0.037)) * 1.5;
        gc = mix(gc, imgPalette(hue * 0.159 + hash21(cell + 4.4) * 0.3), 0.4);
        col += gc * dot_ * (1.2 + 0.8 * hash21(cell + 2.2));
    }
    // The shells themselves as a faint glow, and the web on the bass.
    col += shellCol * 0.9;
    col += imgPalette(hue * 0.159 + 0.6) * web * web * 0.6 * (0.4 + 0.6 * clamp(audioBass, 0.0, 1.0));
    col += imgPalette(hue * 0.159 + 0.6) * 0.05;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
