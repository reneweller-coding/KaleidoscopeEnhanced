#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file EnneperMinimalSurfaceHyperfold.frag
 * @brief ENNEPER MINIMAL SURFACE HYPERFOLD: 220x120 parametric grid of a higher-order
 * self-intersecting Enneper minimal surface. Gaussian curvature shading, double-sided
 * specular glints, and photo texturing mapped along isothermal coordinate patches.
 *   audioAdvance -> rotates isometric parameter domain through 3D space
 *   audioKick    -> flashes Gaussian curvature focal point highlights
 *   audioSwell   -> widens self-intersecting hyperfold blade amplitude
 *   audioCentroid-> shifts minimal surface harmonic color spectra
 *
 * Per-activation variety:
 *   enneperScaleP float parameter domain scale              (0.8..2.2)
 *   hyperfoldP    float higher-order harmonic folding       (0.5..2.0)
 *   specularP     float double-sided metallic specular gain (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vCurvature;

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
    vec3 lightDir = normalize(vec3(0.5, 0.7, 0.6));
    float diff = max(0.0, abs(dot(vNormal, lightDir)));
    float spec = pow(max(0.0, abs(dot(vNormal, vec3(0.0, 0.0, 1.0)))), 22.0) * (specularP > 0.01 ? specularP : 1.2);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.5 + 0.5 * diff);
    col += vCol * vCurvature * 2.0 * (0.8 + 0.4 * audioSwell);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
