#version 330 core
out vec4 fragColor;
// BillboardCity.frag — each screen: kaleido-mirrored crop of the image,
// neon border, brightness driven by the board's own spectrum band.
uniform sampler2D tex0;
uniform float time;
uniform float audioChromaHue;
uniform float audioDrop;

in vec2  vUV;
in vec4  vSeed;
in float vBand;
in float vFade;

/**
 * @file BillboardCity.frag
 * @brief Shades one animated billboard screen in a night-city block: a
 * kaleido-mirrored, slowly sliding crop of the slideshow photo behind a neon
 * border, each screen carrying its own flicker and per-vertex spectrum band.
 *
 * audioChromaHue rotates the neon border's hue; audioDrop punches a burst of
 * extra brightness into every screen on a drop. The per-board brightness
 * (vBand) and fade-in/out (vFade) are already audio- and lifetime-modulated
 * per vertex by the companion vertex shader; time drives both the crop's
 * slow slide and each screen's individual flicker rate.
 */

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    // Kaleido-mirrored crop: the screen content subtly slides with time.
    vec2 uv = vSeed.xy * 0.5
            + abs(fract(vUV * (1.0 + vSeed.z)
                        + vec2(time * 0.02, 0.0)) * 2.0 - 1.0) * 0.5;
    vec3 col = texture(tex0, uv).rgb;

    // The board's spectrum band lights the screen; some boards flicker.
    float flicker = 0.9 + 0.1 * sin(time * (20.0 + vSeed.w * 40.0));
    col *= (0.45 + 1.5 * vBand) * flicker;

    // Neon border in the board's own hue.
    vec2  b      = min(vUV, 1.0 - vUV);
    float border = 1.0 - smoothstep(0.02, 0.06, min(b.x, b.y));
    col = mix(col, hueRot(vec3(1.0, 0.3, 0.8),
                          vSeed.w * 4.0 + audioChromaHue), border);

    col *= vFade * (1.0 + 0.9 * audioDrop);
    fragColor = vec4(col * 1.25, 1.0);
}
