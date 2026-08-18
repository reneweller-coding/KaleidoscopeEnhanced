#version 330 core
out vec4 fragColor;
/**
 * @file FxPlain.frag
 * @brief The plain (pass-through) overlay: shows the finished scene
 * unchanged.
 *
 * Since the Transitions/ split, scene cross-fading is the transition
 * pass's job and overlays receive the already-blended scene on tex0 with
 * interpolation pinned to 1.0 - so this shader reduces to a copy.  It is
 * the resident default overlay (~90% of the time in the presets); the
 * 28-style transition library it used to carry lives on as the individual
 * shaders in Transitions/.
 * interpolation: kept for interface compatibility (1 = tex0 fully visible).
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
