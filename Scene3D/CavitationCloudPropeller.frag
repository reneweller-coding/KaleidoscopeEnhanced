#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CavitationCloudPropeller.frag
 * @brief Fragment stage for CavitationCloudPropeller: green-blue water
 * with light shafts from above, the propeller in dark bronze, the bubbles
 * as round lenses with a bright rim that flash white as they collapse
 * (the kick lights the collapse), the treble a sparkle on the cloud.
 *
 * Audio Reactivity: audioKick -> collapse flash; audioHigh -> sparkle;
 *                   audioBass -> shaft glow; audioLevel -> brightness.
 */
in vec2  vTexCoord;   ///< Texture coordinate (from the vertex stage).
in vec3  vWorld;   ///< World position (from the vertex stage).
in float vKind;   ///< Element kind (from the vertex stage).
in float vLife;

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 water = mix(vec3(0.03, 0.2, 0.28), imgPalette(hue * 0.159 + 0.55) * 0.5, 0.3);
    vec3 col;
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = mix(water * 0.4, water * 1.8 + vec3(0.05, 0.2, 0.2), uv.y);
        float rays = pow(0.5 + 0.5 * sin(uv.x * 40.0 + uv.y * 3.0 + sceneAdvance * 0.25), 10.0) * uv.y;
        col += vec3(0.3, 0.6, 0.6) * rays * 0.5;
        vec3 photo = img(fract(uv * vec2(3.0, 2.0) + sceneAdvance * 0.02));
        col += photo * pow(dot(photo, vec3(0.333)), 2.0) * 0.4 * uv.y;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 2.5)
    {
        // Propeller: dark bronze, shaded by the blade section.
        vec3 bronze = mix(vec3(0.45, 0.35, 0.2), imgPalette(hue * 0.159 + 0.1), 0.3);
        col = bronze * (0.25 + 0.6 * vLife) * (0.7 + 0.5 * clamp(audioBass, 0.0, 1.0));
        col += vec3(0.6, 0.7, 0.7) * pow(vTexCoord.y, 4.0) * 0.3;
        fragColor = vec4(col, 1.0);
        return;
    }
    // A bubble: round lens, bright rim, a highlight; the collapse flash.
    vec2 d = (vTexCoord - 0.5) * 2.0;
    float r = length(d);
    if (r > 1.0) discard;
    float rim = smoothstep(0.55, 1.0, r);
    vec3 through = water * 1.6 + vec3(0.15);
    col = mix(through, vec3(0.85, 0.95, 1.0), rim * 0.8);
    col += vec3(1.0) * pow(max(1.0 - length(d - vec2(-0.4, 0.4)) * 1.6, 0.0), 3.0) * 0.6;
    float collapsing = smoothstep(0.8, 0.95, vLife);
    col += vec3(1.0, 0.98, 0.9) * collapsing * (0.6 + 2.0 * audioKick);
    col += vec3(0.8, 0.95, 1.0) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.3 * rim;
    // Distance fade into the water.
    float fog = 1.0 - exp(-max(vWorld.z - 5.0, 0.0) * 0.06);
    col = mix(col, water * 1.3, clamp(fog, 0.0, 0.7));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
