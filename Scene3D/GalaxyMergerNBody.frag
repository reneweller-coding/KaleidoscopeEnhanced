#version 330 core
out vec4 fragColor;
/**
 * @file GalaxyMergerNBody.frag
 * @brief Fragment stage for GalaxyMergerNBody: soft star dots, two glowing
 * cores and a deep-space sky.  A star is a quad that discards outside its
 * radial falloff, so the discs read as dust rather than confetti; the cores
 * (kind 2) are wide soft glows swelling with the bass; the sky (kind -1) is
 * near-black with the photo's grain as a distant star field.
 *
 * Audio Reactivity: audioKick flashes the stars; audioBass swells the cores.
 */
in vec4  vColor;
in vec2  vTexCoord;
in float vDepth;
in float vKind;
in float vSpeed;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;

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
    vec3 col;
    if (vKind < 0.0)
    {
        vec3 deep = imgPalette(0.55) * 0.05 * (1.0 + 0.5 * audioSwell);
        // Distant stars: a hashed star field (the photo's bright patches read
        // as blobs, not stars).
        vec2 su = vTexCoord * vec2(240.0, 140.0);
        vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
        float hs = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        float star = step(0.986, hs) * exp(-dot(f, f) * 9.0) * (0.5 + 0.5 * fract(hs * 57.0));
        col = deep + vec3(star);
    }
    else if (vKind > 1.5)
    {
        vec2 d = vTexCoord - 0.5;
        float r = length(d) * 2.0;
        float core = exp(-r * r * 12.0);
        float halo = exp(-r * 2.8) * (0.5 + 0.7 * audioBass);
        float a = core + halo;
        if (a < 0.03) discard;
        col = mix(imgPalette(0.9), vec3(1.0, 0.95, 0.85), 0.5) * (core * 1.8 + halo * 0.8);
    }
    else
    {
        vec2 d = vTexCoord - 0.5;
        float r = length(d) * 2.0;
        float a = exp(-r * r * 4.0) - 0.02;
        if (a < 0.04) discard;
        col = vColor.rgb * (a * 2.0) * (1.0 + 0.6 * audioKick);
        col += vColor.rgb * clamp(vSpeed * 0.3, 0.0, 0.6) * a;   // the streams run hot
        col *= clamp(1.5 - vDepth * 0.07, 0.35, 1.0);
    }
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
