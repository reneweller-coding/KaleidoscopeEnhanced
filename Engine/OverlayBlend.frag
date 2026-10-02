#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file OverlayBlend.frag
 * @brief The FINAL pass blending the outgoing and incoming OVERLAY outputs
 * during an FX-overlay switch: a plain linear mix.
 *
 * The styled transition variety lives in Transitions/ and fires on SCENE
 * fades; overlay switches are deliberately a simple dissolve (they are
 * infrequent, and with FxPlain carrying ~90% of the overlay time most
 * switches are Plain <-> X where a styled wipe would barely register).
 * interpolation: 1 = old overlay (tex0) fully visible .. 0 = new (tex1).
 */
uniform vec2 resolution;   ///< Size of the render target in pixels.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = gl_FragCoord.xy / resolution;
    fragColor = mix(texture(tex1, p), texture(tex0, p),
                    clamp(interpolation, 0.0, 1.0));
}
