#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HelicoidMinimalSurfaceTunnel.frag
 * @brief HELICOID MINIMAL SURFACE TUNNEL: 220x120 heightfield grid of an infinite double-helical
 * minimal surface (the only ruled minimal surface besides the plane). Ruled spiral ramps,
 * zero mean curvature lighting, specular sheen, and photo texturing.
 *   audioAdvance -> drives continuous helical winding & camera spiral advance
 *   audioKick    -> flashes ruled line reflection glints & caustic highlights
 *   audioSwell   -> widens minimal surface tunnel radius & ramp breadth
 *   audioCentroid-> shifts ruled spiral minimal surface color spectra
 *
 * Per-activation variety:
 *   helicoidPitchP float helical ramp screw pitch           (0.3..1.2)
 *   specularP      float minimal surface specular reflection (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vHelicoidAngle;

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

    // Ruled surface line markings along radius
    vec2 p = vUV * 2.0 - 1.0;
    float ruledLine = exp(-abs(fract(p.x * 12.0) - 0.5) * 12.0);

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * ruledLine * 0.8;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col *= 2.65;   // measured-dark lift (visual pass)
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
