#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CalabiYauSixDimensionalManifoldCrossSection.frag
 * @brief CALABI-YAU SIX-DIMENSIONAL MANIFOLD CROSS SECTION: 220x120 heightfield grid of a 3D
 * projection of a 6-dimensional Ricci-flat Calabi-Yau compactification manifold (quintic threefold).
 * Toric folds, complex Käler metric modulations, glass specular sheen, and string-theory photo texturing.
 *   audioAdvance -> navigates complex structure moduli space deformation & rotation
 *   audioKick    -> flashes singular conifold transition & mirror symmetry bursts
 *   audioSwell   -> expands Calabi-Yau compactification radius & Kähler volume form
 *   audioCentroid-> shifts Ricci-flat metric curvature invariant color spectra
 *
 * Per-activation variety:
 *   calabiScaleP float Calabi-Yau manifold 3D scale           (0.8..2.2)
 *   specularP    float complex manifold facet specular gain  (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vCalabiPhase;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float specularP;   ///< Specular knob, 0..1.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);
    
    // Complex coordinate grid lines
    vec2 p = vUV * 18.0;
    float gridLine = exp(-abs(fract(p.x) - 0.5) * 16.0) + exp(-abs(fract(p.y) - 0.5) * 16.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * gridLine * 0.8;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
