#version 330 core
out vec4 fragColor;
/**
 * @file FadeOutDissolution.frag
 * @brief Fragment stage for FadeOutDissolution: each particle shows its
 * patch of the photo; as it frees it fades toward the palette and sparkles
 * on the kick; the backdrop (kind -1) is near-black with a faint palette
 * glow so the dissolving picture has dark to thin into.
 *
 * Audio Reactivity: audioKick sparkles the freed particles; audioLevel is
 *                   the curtain brightness; audioFadeOut dims the backdrop.
 */
in vec2  vTexCoord;
in float vDepth;
in float vKind;
in float vFree;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioKick;
uniform float audioLevel;
uniform float audioFadeOut;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
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

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 col;
    if (vKind < 0.0)
    {
        col = imgPalette(hue * 0.159 + 0.6) * 0.035 * (1.0 - 0.7 * clamp(audioFadeOut, 0.0, 1.0));
    }
    else
    {
        vec3 photo = img(vTexCoord);
        vec3 freed = mix(photo, imgPalette(hue * 0.159 + 0.2) * 1.4, 0.6);
        col = mix(photo, freed, vFree) * (0.7 + 0.5 * audioLevel);
        // Freed particles thin out and sparkle.
        col *= 1.0 - 0.6 * vFree * vFree;
        col += imgPalette(hue * 0.159 + 0.9) * vFree * audioKick * 0.8;
    }
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
