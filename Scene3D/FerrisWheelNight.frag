#version 330 core
out vec4 fragColor;
/**
 * @file FerrisWheelNight.frag
 * @brief Fragment stage for FerrisWheelNight: a night sky with round stars,
 * the fairground below as the photo lit by stalls (the swell), the wheel's
 * spokes and rim strung with round lamps whose patterns run with the
 * spectrum bands (spoke i = band i, lamps along the spoke light up to the
 * band's level; the rim lamps chase on the clock), the cabins as photo
 * boxes with lit windows, the kick a flash of the hub star.
 *
 * Audio Reactivity: audioSpectrum[32] -> spoke lamps; audioKick -> hub flash;
 *                   audioSwell -> fair light; audioLevel -> brightness.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vAux;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioSwell;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float fair = 0.8 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (vKind < -1.5)
    {
        // The fairground: the photo as stalls and crowd, lit warm.
        vec2 uv = vTexCoord;
        col = img(fract(uv * vec2(4.0, 1.0))) * mix(vec3(0.8, 0.6, 0.4), imgPalette(hue * 0.159 + 0.1), 0.3) * fair * (0.3 + 0.7 * (1.0 - uv.y));
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = mix(vec3(0.02, 0.02, 0.06), vec3(0.06, 0.04, 0.1), 1.0 - uv.y);
        vec2 su = uv * vec2(260.0, 150.0); vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
        vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
        col += vec3(0.7) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc));
        col += vec3(0.3, 0.2, 0.3) * exp(-(uv.y) * 3.0) * fair * 0.3;    // the fair's glow low on the sky
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 3.5)
    {
        // The rim: dark steel with round lamps chasing on the clock.
        float along = vAux + vTexCoord.x / 48.0;
        float lamp = pow(0.5 + 0.5 * sin(along * 6.2831853 * 24.0), 12.0);
        float chase = 0.5 + 0.5 * sin(along * 6.2831853 * 6.0 - sceneAdvance * 3.0);
        vec3 lc = imgPalette(hue * 0.159 + fract(along * 2.0)) * 1.6 + 0.2;
        col = vec3(0.18, 0.18, 0.2) + lc * lamp * (0.9 + 1.2 * chase);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 2.5)
    {
        // Hub, legs and hangers: dark steel; the hub star flashes on the kick.
        col = vec3(0.14, 0.14, 0.16) * (0.5 + 0.5 * vTexCoord.y) + vec3(1.0, 0.9, 0.7) * audioKick * 0.5 * smoothstep(0.6, 0.0, length(vTexCoord - 0.5));
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // A spoke: round lamps along it light up to the band level.
        int band = int(mod(vId, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        float along = vTexCoord.x;                                     // 0 hub .. 1 rim
        float lamp = pow(0.5 + 0.5 * sin(along * 6.2831853 * 10.0), 12.0);
        float on = smoothstep(along - 0.05, along + 0.05, e * 1.1);
        vec3 lc = imgPalette(hue * 0.159 + float(band) / 32.0) * 1.6 + 0.2;
        col = vec3(0.16, 0.16, 0.18) + lc * lamp * (0.35 + 1.6 * on);
        fragColor = vec4(col, 1.0);
        return;
    }
    // A cabin: the photo as its painted panel, windows lit.
    vec3 photo = img(vTexCoord);
    float window = step(0.35, vTexCoord.y) * step(vTexCoord.y, 0.8) * smoothstep(0.35, 0.3, abs(fract(vTexCoord.x * 3.0) - 0.5));
    vec3 body = mix(photo * 1.2, imgPalette(hue * 0.159 + vAux), 0.3) * fair * 0.9;
    col = mix(body, vec3(1.0, 0.9, 0.6) * (0.8 + 0.6 * fair), window * 0.8);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
