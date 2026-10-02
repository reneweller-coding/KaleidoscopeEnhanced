#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HyperbolicPseudosphereTractroid.frag
 * @brief HYPERBOLIC PSEUDOSPHERE TRACTROID: a 5 x 4 LATTICE of pseudospheres of constant negative
 * Gaussian curvature (K = -1, the surface of revolution of the tractrix), each turning on its own
 * axis and hung in frustum coordinates so the lattice spans the whole frame. Flared trumpet horn
 * cusps, hyperbolic geodesic streamlines, glass specular sheen, and non-Euclidean photo texturing.
 *   audioAdvance -> navigates hyperbolic tractrix geodesic flow & horn rotation
 *   audioKick    -> flashes singular equator rim & cusp specular reflections
 *   audioSwell   -> widens pseudosphere trumpet flare radius & wall transmission
 *   audioCentroid-> shifts hyperbolic curvature dispersion spectra
 *
 * Per-activation variety:
 *   pseudoScaleP float pseudosphere 3D scale               (0.8..2.2)
 *   fresnelP     float glass tractricoid Fresnel gain     (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vTractrixU;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float fresnelP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (fresnelP > 0.01 ? fresnelP : 1.2);
    
    // Geodesic coordinate lines
    vec2 p = vUV * 2.0 - 1.0;
    float geodLine = exp(-abs(fract(p.x * 8.0) - 0.5) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * geodLine * 0.8;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
