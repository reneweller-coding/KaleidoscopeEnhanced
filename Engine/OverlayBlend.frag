#version 330 core
out vec4 fragColor;
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
uniform vec2 resolution;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main()
{
    vec2 p = gl_FragCoord.xy / resolution;
    fragColor = mix(texture(tex1, p), texture(tex0, p),
                    clamp(interpolation, 0.0, 1.0));
}
