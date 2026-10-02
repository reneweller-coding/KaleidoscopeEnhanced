#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// SolarWindMagnetosphere.frag

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float bowShockP;
uniform float auroraP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
in vec4 vColor;
in float vHeight;

/**
 * @file SolarWindMagnetosphere.frag
 * @brief Shades the magnetosphere bow-shock heightfield (built in
 * SolarWindMagnetosphere.vert) with a diffuse/specular lighting term, a
 * projected sample of the live slideshow photo, a wireframe magnetic-flux
 * grid, and additive auroral colour carried in vColor.
 *
 * audioLevel boosts the auroral colour; audioHigh brightens both the
 * flux-grid wireframe glow and the specular highlight; audioChromaHue (with
 * the hueP preset) rotates the final composite hue. Most of the other
 * declared audio uniforms (audioAdvance, audioKick, audioSubBass, audioBass,
 * audioMid, audioSwell, audioCentroid, audioValence, audioFlux, and the
 * bowShockP/auroraP/speedP presets) drive the heightfield's bow-shock
 * deformation and vertex colour in the vertex shader rather than here.
 */

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    vec3 N = normalize(vNormal);
    vec3 L = normalize(vec3(0.4, 0.8, 1.0));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 24.0);

    // Photo texture mapping onto magnetosphere heightfield
    vec3 photo = img(fract(vTexCoord * 2.0));

    // Magnetic flux wireframe grid lines
    vec2 gridLines = abs(fract(vTexCoord * 40.0) - 0.5);
    float gridWire = smoothstep(0.46, 0.49, max(gridLines.x, gridLines.y));

    // Auroral luminescence
    vec3 auroraCol = vColor.rgb * (1.2 + 0.8 * audioLevel);
    vec3 wireCol = vec3(0.2, 0.9, 1.0) * gridWire * (0.8 + 1.2 * audioHigh);

    vec3 col = (photo * 0.4 + auroraCol * 0.8) * (diff * 0.6 + 0.4) + wireCol;
    col += vec3(1.0, 0.95, 0.85) * spec * (0.8 + 1.5 * audioHigh);

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9));

    fragColor = vec4(col, 1.0);
}
