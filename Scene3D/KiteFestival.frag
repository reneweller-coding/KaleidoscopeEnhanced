#version 330 core
out vec4 fragColor;
/**
 * @file KiteFestival.frag
 * @brief Fragment stage for KiteFestival: a bright windy sky with cloud
 * streaks, a green hillside carrying the photo as its patchwork of fields,
 * kites as photo diamonds with bright spars, tails in palette colours that
 * sparkle with the treble, and the kick lighting the kite edges.
 *
 * Audio Reactivity: audioHigh -> tail sparkle; audioKick -> kite edges;
 *                   audioSwell -> sunlight; audioLevel -> brightness.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vLit;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioKick;
uniform float audioHigh;
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
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float sun = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (vKind < -1.5)
    {
        // Hillside: fields of the photo in green, hedges as darker lines.
        vec2 uv = vTexCoord;
        vec3 field = img(fract(uv * vec2(3.0, 2.0))) * vec3(0.5, 0.9, 0.4) * 1.2;
        float hedge = smoothstep(0.02, 0.0, min(abs(fract(uv.x * 6.0) - 0.5), abs(fract(uv.y * 4.0) - 0.5)) - 0.46);
        col = mix(field, vec3(0.1, 0.25, 0.08), hedge * 0.7) * sun;
        col = mix(col, vec3(0.6, 0.75, 0.95), smoothstep(0.5, 1.0, uv.y) * 0.5);   // haze toward the ridge
    }
    else if (vKind < -0.5)
    {
        // Sky: blue with wind-streaked clouds moving on the clock; the sun.
        vec2 uv = vTexCoord;
        vec3 sky = mix(vec3(0.5, 0.75, 1.0), vec3(0.2, 0.4, 0.9), uv.y);
        float cl = fbm(vec2(uv.x * 6.0 - sceneAdvance * 0.05, uv.y * 12.0));
        float streak = smoothstep(0.45, 0.7, cl) * 0.8;
        col = mix(sky, vec3(1.0), streak) * sun;
        col += vec3(1.0, 0.95, 0.8) * exp(-length(uv - vec2(0.7, 0.75)) * 6.0) * sun * 0.8;
    }
    else if (vKind > 2.5)
    {
        col = vec3(0.9) * 0.6;                                    // the string
    }
    else if (vKind > 0.5)
    {
        // Tail ribbon: a palette colour per kite, sparkling with the treble.
        vec3 rc = imgPalette(hue * 0.159 + fract(vLit * 3.0 + 0.2)) * 1.5 + 0.2;
        float sp = pow(0.5 + 0.5 * sin(vTexCoord.x * 20.0 + sceneAdvance * 6.0), 6.0);
        col = rc * (0.8 + 0.4 * vTexCoord.x) * sun + vec3(1.0) * sp * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.8;
    }
    else
    {
        // Kite: the photo tile, a pale sail with bright spars on the kick.
        vec3 photo = img(fract(vTexCoord));
        col = mix(photo * 1.4, imgPalette(hue * 0.159 + vLit) * 1.4, 0.3) * sun;
        col += vec3(0.1);
        // The spars: cross through the diamond centre (uv centre ~ (0.15,0.15) of the tile window).
        vec2 c = vTexCoord;
        float spar = 0.0;
        col += imgPalette(hue * 0.159 + 0.9) * spar;
        col *= 1.0 + 0.5 * audioKick;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
