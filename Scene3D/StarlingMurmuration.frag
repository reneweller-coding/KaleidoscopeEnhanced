#version 330 core
out vec4 fragColor;
/**
 * @file StarlingMurmuration.frag
 * @brief Fragment stage for StarlingMurmuration: bird silhouettes over a dusk sky.
 * An indirect scene has no background shell, so the generator emits one
 * huge sky quad (vKind = 1) that is painted here as a dusk gradient sampled
 * from the slideshow image; every other fragment is a bird, shaded as a
 * silhouette that catches the sky at the flock's fringe.
 *
 * Audio Reactivity: audioKick brightens the wing edges for a beat;
 *                   audioSwell warms the sky.
 */
in vec4  vColor;
in vec2  vTexCoord;
in float vDepth;
in float vKind;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioKick;
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
    if (vKind > 0.5)
    {
        // Dusk: the photo, stretched soft, banded from a warm horizon to a
        // dark zenith.  Swell warms the horizon.
        vec3 photo = img(vec2(vTexCoord.x, mix(0.3, 0.8, vTexCoord.y)));
        vec3 horizon = imgPalette(0.05) * (0.9 + 0.5 * audioSwell);
        vec3 zenith  = imgPalette(0.6) * 0.25;
        vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.85, vTexCoord.y));
        sky = mix(sky, photo * 0.8, 0.35);
        fragColor = vec4(sky, 1.0);
        return;
    }
    float edge = smoothstep(0.75, 1.0, abs(vTexCoord.x - 0.5) * 2.0 + vTexCoord.y * 0.3);
    vec3 col = vColor.rgb + vec3(0.6, 0.55, 0.7) * edge * audioKick * 0.5;
    vec3 haze = imgPalette(0.05) * 0.5;
    float fog = clamp((vDepth - 3.0) * 0.12, 0.0, 0.7);
    col = mix(col, haze, fog);
    fragColor = vec4(col, 1.0);
}
