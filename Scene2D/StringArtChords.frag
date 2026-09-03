#version 330 core
out vec4 fragColor;
/**
 * @file StringArtChords.frag
 * @brief STRING ART CHORDS: twelve pins on a circle, one per pitch class;
 * strings run between the classes that sound together -- a chord is
 * literally a chord across the circle.  Each string fades in and out with
 * the product of its two pins' chroma (continuous), the wheel turns
 * steadily on the scene clock, the pins glow with their class, and the
 * strings shimmer with the treble.  Behind the wheel, the photo as the
 * board.  Camera still.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> string presence and pin glow (continuous)
 *   sceneAdvance    -> wheel rotation (continuous)
 *   audioKick       -> the strings brighten (light)
 *   audioHigh       -> string shimmer (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: radiusP, threadP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float radiusP;
uniform float threadP;
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

float segDist(vec2 p, vec2 a, vec2 b)
{
    vec2 d = b - a; float t = clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0);
    return length(p - (a + d * t));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float R = 0.36 + 0.08 * clamp(radiusP, 0.0, 1.0);
    float thread = 0.002 + 0.003 * clamp(threadP, 0.0, 1.0);
    float rot = sceneAdvance * 0.1 + sceneTime * 0.02;

    // The board: the photo, warm and dim, with the wheel's shadow.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.5), imgPalette(hue * 0.159 + 0.55) * 0.9, 0.5) + imgPalette(hue * 0.159 + 0.55) * 0.08 + 0.03;
    float r = length(p);
    col *= 0.8 + 0.2 * smoothstep(R + 0.02, R + 0.12, r);

    // Pin positions on the wheel (circle of fifths order for pleasing
    // chords: class k at index (7k mod 12)).
    vec2 pin[12];
    float chroma[12];
    for (int k = 0; k < 12; ++k)
    {
        float idx = mod(float(k) * 7.0, 12.0);
        float a = idx / 12.0 * 6.2831853 + rot;
        pin[k] = vec2(cos(a), sin(a)) * R;
        chroma[k] = clamp(audioChroma[k] * 1.4, 0.0, 1.0);
    }
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    // Strings: every pair, weighted by the product of the two chroma values.
    vec3 strings = vec3(0.0);
    for (int i = 0; i < 12; ++i)
    {
        for (int j = i + 1; j < 12; ++j)
        {
            float wgt = sqrt(chroma[i] * chroma[j]);
            if (wgt < 0.05) continue;
            float d = segDist(p, pin[i], pin[j]);
            float line = smoothstep(thread * (0.6 + wgt), thread * 0.3, d);
            // Shimmer: a slow travelling brightness along the string.
            float along = dot(p - pin[i], normalize(pin[j] - pin[i]));
            float sh = 0.7 + 0.3 * sin(along * 30.0 - sceneAdvance * 3.0) * hi;
            vec3 sc = mix(imgPalette(hue * 0.159 + float(i) / 12.0), imgPalette(hue * 0.159 + float(j) / 12.0), 0.5);
            strings += (sc * 0.6 + 0.4) * line * wgt * sh;
        }
    }
    col += strings * (2.4 + 0.8 * audioKick);
    // The pins: round brass heads glowing with their class.
    for (int k = 0; k < 12; ++k)
    {
        float d = length(p - pin[k]);
        float head = smoothstep(0.014, 0.008, d);
        float glow = exp(-d * 25.0);
        vec3 pc = imgPalette(hue * 0.159 + float(k) / 12.0);
        col = mix(col, vec3(0.9, 0.75, 0.4), head);
        col += pc * glow * (0.2 + 1.2 * chroma[k]);
    }
    // The wheel rim.
    col += vec3(0.5, 0.4, 0.25) * smoothstep(0.006, 0.0, abs(r - R - 0.02)) * 0.8;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
