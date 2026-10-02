#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
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
in vec2  vTexCoord;   ///< Texture coordinate (from the vertex stage).
in float vDepth;   ///< Depth (from the vertex stage).
in float vKind;   ///< Element kind (from the vertex stage).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
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
