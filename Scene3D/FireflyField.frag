#version 330 core
out vec4 fragColor;
// FireflyField.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file FireflyField.frag
 * @brief Shades one firefly as a soft radial glow sprite (a Gaussian
 * falloff from the point-sprite center), meant to be additively blended so
 * overlapping fireflies pool into brighter light.
 *
 * This fragment shader declares no audio uniforms of its own; its
 * audio-reactive color and brightness (vCol) are computed per-vertex by the
 * companion vertex shader and only shaped here by the radial falloff.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    // Gain trimmed from 1.8: the lamps are now several times wider and cover
    // the whole frame, so the same total light no longer has to come out of
    // a blown-out core (the old peak clipped to flat over-saturated green).
    fragColor = vec4(vCol.rgb * a * 1.25, 1.0);
}
