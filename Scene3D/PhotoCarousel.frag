#version 330 core
out vec4 fragColor;
// PhotoCarousel.frag — each card is a seeded crop of the current image with
// a thin glowing frame; the frame colour follows the music's key.
uniform sampler2D tex0;
uniform float audioChromaHue;
uniform float audioKick;
uniform float audioDrop;

in vec2  vUV;
in vec4  vSeed;
in float vGlow;

/**
 * @file PhotoCarousel.frag
 * @brief Shades one card of the photo carousel: a seeded crop of the
 * current slideshow image (tex0) with a thin glowing frame.
 *
 * audioChromaHue sets the frame's hue (offset per card by its seed),
 * audioKick brightens the frame flashes, and audioDrop lifts the whole
 * card's exposure; vGlow (from the vertex shader) additionally modulates
 * per-card brightness.
 */

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    // Seeded crop window: 40 % of the image, anywhere.
    vec2 crop = vSeed.xy * 0.6;
    vec3 col  = texture(tex0, crop + vUV * 0.4).rgb;

    // Thin glowing frame around the card edge.
    vec2  b     = min(vUV, 1.0 - vUV);
    float frame = 1.0 - smoothstep(0.03, 0.07, min(b.x, b.y));
    vec3  fCol  = hueRot(vec3(0.9, 0.6, 0.2),
                         audioChromaHue + vSeed.z * 2.0);
    col = mix(col, fCol * (0.8 + 1.4 * audioKick), frame);

    col *= (0.75 + 0.45 * vGlow) * (1.0 + 0.8 * audioDrop);

    fragColor = vec4(col * 1.15, 1.0);
}
