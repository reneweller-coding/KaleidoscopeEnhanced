#version 330 core
out vec4 fragColor;
/**
 * @file CephalopodChromatophores.frag
 * @brief CEPHALOPOD CHROMATOPHORES: octopus skin, close.  Thousands of
 * chromatophores -- round pigment sacs that muscles pull open -- expand
 * with the band their patch of skin listens to, iridophores beneath them
 * shimmer with the treble, and the "passing cloud" display -- dark waves
 * travelling across the skin -- runs on the scene clock.  The photo is the
 * skin's ground colour.  Nothing moves but the cells and the light; camera
 * fixed on the skin.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> chromatophore expansion by patch (light-sized, smooth)
 *   sceneAdvance      -> passing-cloud waves (continuous)
 *   audioHigh         -> iridophore shimmer (light)
 *   audioSwell        -> overall expansion bias (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: densP, cloudP, hueP.
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
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
uniform float cloudP;
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
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dens = 22.0 + 18.0 * clamp(densP, 0.0, 1.0);
    float cloudAmt = 0.4 + 0.6 * clamp(cloudP, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;
    float bias = 0.3 + 0.5 * clamp(audioSwell, 0.0, 1.0);

    // Skin ground: the photo, soft, warm; the passing cloud darkens it in
    // travelling bands.
    vec3 skin = (interpolation * textureLod(tex0, uv, 2.0) + (1.0 - interpolation) * textureLod(tex1, uv, 2.0)).rgb;
    skin = mix(skin, skin * imgPalette(hue * 0.159 + 0.1) * 1.6, 0.25) * 0.9 + 0.05;
    float cloud = 0.5 + 0.5 * sin(p.x * 4.0 + p.y * 1.5 - clock * 2.0 + 1.5 * noise2(p * 2.0 + clock * 0.1));
    cloud = smoothstep(0.35, 0.8, cloud) * cloudAmt;
    vec3 col = skin;

    // Chromatophores: two size classes on jittered grids; each cell has a
    // patch band (by position), expands with the band energy plus the
    // cloud and the bias; three pigment colours by cell hash.
    for (int layer = 0; layer < 2; ++layer)
    {
        float sc = dens * (1.0 + 0.6 * float(layer));
        vec2 gu = p * sc + float(layer) * 7.3; vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
        vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        int band = int(mod(floor(cell.x * 0.7 + cell.y * 1.3 + 8.0), 32.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        float expand = clamp(bias + 0.22 * e + 0.6 * cloud, 0.0, 1.3);
        float r = 0.12 + 0.3 * expand * (0.7 + 0.5 * hash21(cell + 9.9));
        float d = length(f - off * 0.5);
        float sac = smoothstep(r, r * 0.6, d);
        float h = hash21(cell + 1.1);
        vec3 pig = (h < 0.4) ? vec3(0.55, 0.12, 0.08) : ((h < 0.75) ? vec3(0.75, 0.45, 0.1) : vec3(0.35, 0.15, 0.05));
        pig = mix(pig, imgPalette(hue * 0.159 + h * 0.3), 0.35);
        col = mix(col, pig, sac * 0.85);
        // A darker centre (the pigment is thickest there).
        col *= 1.0 - 0.25 * smoothstep(r * 0.45, 0.0, d) * sac;
    }
    // Iridophores: fine structural-colour sparkle between the cells, on the treble.
    vec2 iu = p * 90.0; vec2 ic = floor(iu); vec2 iff = fract(iu) - 0.5;
    vec2 io = vec2(hash21(ic + 2.3), hash21(ic + 6.1)) - 0.5;
    float irid = smoothstep(0.2, 0.05, length(iff - io * 0.6)) * step(0.9, hash21(ic));
    vec3 iridCol = 0.5 + 0.5 * cos(6.2831853 * (hash21(ic) + vec3(0.0, 0.33, 0.66) + clock * 0.1));
    col += iridCol * irid * (0.25 + 0.45 * clamp(audioHigh * 2.0, 0.0, 1.0));
    // Skin sheen.
    col *= 0.85 + 0.15 * (1.0 - length(p) * 0.5);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
