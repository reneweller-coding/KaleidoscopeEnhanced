#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec4 vCol;   ///< Colour (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).

/**
 * @file CherenkovCascadeShower.frag
 * @brief Shades a single point-sprite particle in a Cherenkov air-shower
 * cascade as a soft circular glow, blending its per-vertex colour with the
 * slideshow photo, then applying a soft-knee tone-map so hot audio
 * compresses instead of clipping to white.
 *
 * This fragment stage carries no audio uniforms of its own -- vCol (the
 * per-particle colour and alpha, already audio-modulated per vertex, e.g. by
 * cascade energy or beat timing) is the only reactive input; the shower's
 * response to the music is driven by the companion vertex shader.
 */

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 circ = gl_PointCoord - 0.5;
    float distSq = dot(circ, circ);
    if (distSq > 0.25) discard;

    float core = exp(-distSq * 16.0);
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 col = mix(vCol.rgb, photo * 1.5, 0.4) * core;
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, vCol.a * core);
}
