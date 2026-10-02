#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// HypercubeLatticePillars.frag

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

uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
in vec4 vColor;
in float vHeight;

/**
 * @file HypercubeLatticePillars.frag
 * @brief Shades a lattice of tesseract/hypercube pillar monoliths: a dark
 * photo-textured monolith face with sci-fi neon edge lines picked out near
 * each cube corner (vTexCoord), lit with a simple diffuse+specular term.
 *
 * audioHigh brightens the neon edge color, audioKick intensifies the
 * specular highlight, and audioChromaHue (plus the hueP preset) rotates
 * the final color's hue. Most of the other declared audio* uniforms in
 * this file (audioPhase, audioAdvance, audioSwell, audioLevel,
 * audioCentroid, audioValence, audioSubBass, audioBass, audioMid,
 * audioFlux) are unused by this particular fragment stage.
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
    vec3 L = normalize(vec3(0.5, 0.8, 1.0));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 32.0);

    // Monolith face texture
    vec3 photo = img(fract(vTexCoord));

    // Sci-fi neon edge line on cube corners
    vec2 edgeDist = abs(vTexCoord - vec2(0.5)) * 2.0;
    float maxEdge = max(edgeDist.x, edgeDist.y);
    float neonLine = smoothstep(0.85, 0.98, maxEdge);

    vec3 darkMonolith = vec3(0.05, 0.06, 0.08) * photo;
    vec3 neonCol = vColor.rgb * (1.5 + 1.5 * audioHigh);

    vec3 col = mix(darkMonolith, neonCol, neonLine);
    col += vec3(1.0) * spec * (0.8 + 1.2 * audioKick);

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88));

    fragColor = vec4(col, 1.0);
}
