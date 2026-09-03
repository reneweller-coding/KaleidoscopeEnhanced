#version 330 core
out vec4 fragColor;
/**
 * @file WhiteHoleFountain.frag
 * @brief Fragment stage for WhiteHoleFountain: photo tiles that are bright
 * and white-hot at birth and cool to the photo's own colours as they climb,
 * fading out near the end of their life; the horizon is a blinding disc
 * that flashes on the kick; the sky is deep space with round stars.
 *
 * Audio Reactivity: audioKick flashes the horizon and the newborn tiles;
 *                   audioLevel is the tile brightness.
 */
in vec2  vTexCoord;
in float vDepth;
in float vKind;
in float vLife;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioKick;
uniform float audioLevel;
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
        vec3 deep = imgPalette(hue * 0.159 + 0.6) * 0.04;
        vec2 su = vTexCoord * vec2(240.0, 140.0);
        vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
        float hs = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        vec2 off = vec2(fract(hs * 57.0), fract(hs * 113.0)) - 0.5;
        float star = smoothstep(0.14, 0.02, length(f - off * 0.6)) * step(0.985, hs) * (0.5 + 0.5 * fract(hs * 31.0));
        col = deep + vec3(star);
    }
    else if (vKind > 1.5)
    {
        vec2 d = vTexCoord - 0.5;
        float r = length(d) * 2.0;
        float core = exp(-r * r * 10.0);
        float halo = exp(-r * 3.0);
        float a = core + halo * 0.5;
        if (a < 0.03) discard;
        vec3 hot = mix(vec3(1.0, 0.97, 0.9), imgPalette(hue * 0.159 + 0.9), 0.3);
        col = hot * (core * 3.0 + halo * 0.8) * (1.0 + 1.5 * audioKick);
    }
    else
    {
        // A tile: white-hot at birth, the photo as it cools, gone at the end.
        vec3 photo = img(vTexCoord);
        float heat = 1.0 - smoothstep(0.0, 0.35, vLife);
        float fade = 1.0 - smoothstep(0.75, 1.0, vLife);
        vec3 tint = imgPalette(hue * 0.159 + 0.1);
        col = mix(photo * (0.9 + 0.5 * audioLevel), vec3(1.0, 0.95, 0.85) * 2.5, heat * (0.8 + 0.6 * audioKick));
        col = mix(col, col * tint * 1.6, 0.25);
        col *= fade;
        // A soft edge on the tile.
        vec2 e = min(vTexCoord, 1.0 - vTexCoord);
        float edge = 1.0 - smoothstep(0.0, 0.08, min(e.x, e.y)) * 0.0;
        col *= 1.0;
    }
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
