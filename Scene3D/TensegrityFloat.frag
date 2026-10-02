#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TensegrityFloat.frag
 * @brief Fragment stage for TensegrityFloat: a soft studio of the photo
 * behind, the struts as photo-wrapped bars with a per-face shade, the
 * cables as thin lines that light with their pitch class, the kick a
 * glint along every cable, the swell the studio light.
 *
 * Audio Reactivity: audioChroma[12] -> cable light; audioKick -> cable
 *                   glint; audioSwell -> studio light; audioLevel.
 */
in vec2  vTexCoord;   ///< Texture coordinate (from the vertex stage).
in vec3  vWorld;   ///< World position (from the vertex stage).
in float vKind;   ///< Element kind (from the vertex stage).
in float vShade;
in float vId;   ///< Instance or element id (from the vertex stage).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioChroma[12];   ///< Pitch-class energies (12 values).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
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
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        vec3 soft = (interpolation * textureLod(tex0, uv, 4.0) + (1.0 - interpolation) * textureLod(tex1, uv, 4.0)).rgb;
        col = soft * imgPalette(hue * 0.159 + 0.6) * 1.0 * light + 0.06;
        col *= 0.6 + 0.6 * exp(-length(uv - vec2(0.5, 0.55)) * 1.5);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // A cable: its class colour, lit by the class; a glint runs along it on the kick.
        int k = int(clamp(vId, 0.0, 11.0));
        float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
        vec3 cc = imgPalette(hue * 0.159 + float(k) / 12.0) * 1.6 + 0.2;
        float glint = pow(0.5 + 0.5 * sin(vTexCoord.x * 12.0 - sceneAdvance * 4.0 + float(k)), 12.0);
        col = cc * (0.9 + 1.0 * e) * light + vec3(1.0) * glint * audioKick * 1.5;
        fragColor = vec4(col, 1.0);
        return;
    }
    // A strut face: the photo wrapped along the bar, shaded per face.
    vec3 photo = img(vec2(fract(vTexCoord.x * 2.0 + vId * 0.17), vTexCoord.y));
    col = mix(photo * 1.2, imgPalette(hue * 0.159 + vId * 0.15), 0.25) * (0.25 + 0.9 * vShade) * light;
    col += vec3(1.0) * smoothstep(0.03, 0.0, min(vTexCoord.x, 1.0 - vTexCoord.x)) * 0.3;   // end caps
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
