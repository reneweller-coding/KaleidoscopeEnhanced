#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file KaleidocycleFold.frag
 * @brief Fragment stage for KaleidocycleFold: a paper-craft desk (the
 * photo as the cutting mat), the ring's faces as photo triangles -- each
 * tetrahedron its own tint, each face lit by a spectrum band (24 faces,
 * bands cycling) -- with paper-fold creases at the edges and a shading
 * from a screen-space normal; the kick a flash on the topmost faces, the
 * treble the paper sheen.
 *
 * Audio Reactivity: audioSpectrum[32] -> face light; audioKick -> top flash;
 *                   audioHigh -> sheen; audioSwell -> desk lamp; audioLevel.
 */
in vec2  vTexCoord;   ///< Texture coordinate (from the vertex stage).
in vec3  vWorld;   ///< World position (from the vertex stage).
in float vKind;   ///< Element kind (from the vertex stage).
in float vFace;
in float vId;   ///< Instance or element id (from the vertex stage).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;   ///< High band level, 0..1.
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
    float lamp = 0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (vKind < -1.5)
    {
        // The cutting mat: green grid over the photo.
        vec2 uv = vTexCoord;
        col = mix(img(fract(uv * 2.0)) * 0.4, vec3(0.15, 0.35, 0.3), 0.6) * lamp;
        vec2 gf = abs(fract(uv * vec2(28.0, 16.0)) - 0.5);
        col += vec3(0.2, 0.35, 0.3) * smoothstep(0.02, 0.0, min(gf.x, gf.y) - 0.47) * 0.4;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = img(uv) * imgPalette(hue * 0.159 + 0.6) * 0.4 * lamp + 0.05;
        col *= 0.5 + 0.7 * exp(-length(uv - vec2(0.5, 0.45)) * 1.8);
        fragColor = vec4(col, 1.0);
        return;
    }
    // A face: the photo triangle, tinted per tetrahedron, lit by its band;
    // a screen-space normal from derivatives for the paper shading.
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 L = normalize(vec3(-0.4, 0.8, -0.5));
    float diff = abs(dot(n, L));
    int band = int(mod(vId * 4.0 + vFace, 32.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    vec3 photo = img(fract(vTexCoord * 0.5 + vec2(vId * 0.17, vFace * 0.23)));
    vec3 tint = imgPalette(hue * 0.159 + vId / 6.0);
    col = mix(photo * 1.2, tint * 1.4, 0.35) * (0.5 + 0.9 * diff) * lamp * (0.8 + 0.7 * e);
    // Creases: the triangle edges (uv-based) darkened.
    float edge = min(vTexCoord.y, min(1.0 - vTexCoord.x - vTexCoord.y * 0.5, vTexCoord.x - vTexCoord.y * 0.5));
    col *= 0.7 + 0.3 * smoothstep(0.0, 0.05, edge);
    // Paper sheen on the treble; the top faces flash on the kick.
    col += vec3(1.0) * pow(diff, 8.0) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.3;
    col += tint * audioKick * 0.6 * smoothstep(0.5, 0.9, n.y);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
