#version 330 core
out vec4 fragColor;
/**
 * @file SpectrogramKaleidoscope.frag
 * @brief SPECTROGRAM KALEIDOSCOPE: the mirrored motif is not a photo but
 * the last twenty seconds of the music itself (texSpectro: 32 bands by a
 * 20-second history ring).  The centre is now, the rim is twenty seconds
 * ago; bands run around the wedge, so every note becomes an ornament that
 * drifts outward through the fold as it ages.  The fold count is fixed per
 * activation, the mirror turns on the music's pace, and the only thing that
 * changes fast is what the music itself paints.
 *
 * Audio Reactivity:
 *   texSpectro    -> the motif (the whole point)
 *   sceneAdvance  -> mirror rotation (continuous)
 *   audioKick     -> the centre flashes (light)
 *   audioSwell    -> rim glow (slow)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: sidesP (fold count), spanP (seconds shown), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSpectro;    // 32 bands (x) x history ring (y), unit 28
uniform float spectroHead;       // ring write position, 0..1
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sidesP;
uniform float spanP;
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

// Spectrogram value for band b (0..1) at age (0 = now, 1 = 20 s ago).
float spec(float b, float age)
{
    float x = (floor(b * 32.0) + 0.5) / 32.0;
    float y = fract(spectroHead - age);
    return texture(texSpectro, vec2(x, y)).r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float n   = floor((sidesP > 1.5 ? sidesP : 8.0) + 0.5);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float span = 0.4 + 0.6 * clamp(spanP, 0.0, 1.0);     // fraction of the 20 s shown

    float r = length(p);
    float a = atan(p.y, p.x) + sceneAdvance * 0.1;
    float sector = 6.2831853 / n;
    float loc = mod(a, sector);
    float mir = abs(loc - sector * 0.5);                  // 0 .. sector/2

    // Band runs around the wedge, age runs outward.
    float band = mir / (sector * 0.5);
    float age  = clamp(r / 0.95, 0.0, 1.0) * span;
    float s0 = spec(band, age);
    // A second, finer reading one band over for texture.
    float s1 = spec(band + 0.5 / 32.0, age + 0.01 * span);
    float e = clamp(s0 * 1.5, 0.0, 1.0);

    // Colour: band hue from the palette, brightness the spectrogram; bright
    // notes get a white core.
    vec3 bandCol = imgPalette(hue * 0.159 + band * 0.7);
    vec3 col = bandCol * (0.08 + 1.4 * e * e) + vec3(1.0) * pow(e, 4.0) * 0.6;
    col += bandCol * abs(s0 - s1) * 2.0;                  // edges of the notes
    // Seams of the mirror.
    float seam = exp(-min(loc, sector - loc) * 50.0) * 0.2;
    col += imgPalette(hue * 0.159 + 0.9) * seam;
    // Rim glow on the swell, centre flash on the kick, fade at the edge.
    col += imgPalette(hue * 0.159 + 0.5) * exp(-abs(r - 0.9) * 12.0) * 0.4 * clamp(audioSwell, 0.0, 1.0);
    col *= 1.0 + 0.5 * audioKick * exp(-r * 5.0);
    col *= (0.75 + 0.5 * audioLevel) * (1.0 - 0.5 * smoothstep(0.8, 1.15, r));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
