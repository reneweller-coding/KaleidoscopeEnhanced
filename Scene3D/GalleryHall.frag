#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// GalleryHall.frag — gold-framed image crops under warm gallery light;
// ceiling strips are soft white bars.
uniform sampler2D tex0;
uniform float audioChromaHue;
uniform float audioDrop;

in vec2  vUV;
in vec4  vSeed;
in float vLight;
in float vKind;

/**
 * @file GalleryHall.frag
 * @brief Shades a gallery wall of gold-framed photo crops (vKind < 0.5)
 * under warm spotlighting, plus soft white ceiling light-strip bars
 * (vKind >= 0.5); each frame samples a per-instance seeded crop (vSeed) of
 * the current slideshow photo.
 *
 * audioChromaHue rotates the gold frame's hue slightly, and audioDrop
 * punches the whole scene brighter on a musical drop. audioLevel and
 * audioKick were added specifically to this fragment stage because the
 * vertex-side coupling barely moved any pixels (measured near-zero
 * reactivity), so here they directly scale the final brightness alongside
 * the per-instance vLight term.
 */

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec3 col;
    if (vKind < 0.5)
    {
        // Seeded crop of the image inside a gold frame.
        vec2 crop = vSeed.xy * 0.5;
        col = texture(tex0, crop + vUV * 0.5).rgb;

        vec2  b     = min(vUV, 1.0 - vUV);
        float frame = 1.0 - smoothstep(0.045, 0.09, min(b.x, b.y));
        vec3  gold  = hueRot(vec3(0.85, 0.62, 0.22),
                             audioChromaHue * 0.3) * 0.9;
        col = mix(col, gold, frame);

        // Warm spotlight falls from above.
        col *= vLight * mix(1.15, 0.75, vUV.y) * vec3(1.06, 1.0, 0.9);
    }
    else
    {
        // Ceiling light strip: soft-edged white bar.
        vec2  b    = min(vUV, 1.0 - vUV);
        float body = smoothstep(0.0, 0.25, min(b.x, b.y));
        col = vec3(1.0, 0.97, 0.9) * body * vLight;
    }

    col *= 1.0 + 0.7 * audioDrop;
    fragColor = vec4(col * 1.8 * (0.85 + 0.30 * audioLevel + 0.35 * audioKick), 1.0);
}
