#version 330 core
out vec4 fragColor;
// PlasmaSheet.frag — the timeless smooth plasma: three drifting sine
// fields summed and mapped through a soft palette, hue keyed to the music.
uniform float time;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioLevel;

in vec2  vUV;
in float vH;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2 p = vUV * 8.0;
    float ph = time * 0.30 + audioAdvance * 0.35;

    float v = sin(p.x + ph)
            + sin((p.y + ph) * 0.8)
            + sin((p.x + p.y + ph) * 0.6)
            + sin(length(p - vec2(4.0 + sin(ph * 0.4) * 2.0,
                                  4.0 + cos(ph * 0.3) * 2.0)) * 1.4);
    v *= 0.25;

    vec3 col = vec3(0.55 + 0.45 * sin(v * 3.14159),
                    0.55 + 0.45 * sin(v * 3.14159 + 2.094),
                    0.55 + 0.45 * sin(v * 3.14159 + 4.189));
    col = hueRot(col, audioChromaHue);

    col *= (0.55 + 0.35 * audioSwell + 0.25 * audioLevel)
         * (1.0 + vH * 0.06);                // ripple relief
    // Soft vignette keeps the sheet's edges airy.
    vec2 b = vUV - 0.5;
    col *= 1.0 - dot(b, b) * 1.1;

    // Gently desaturate — silk, not neon.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum), 0.18);

    fragColor = vec4(col * 1.2, 1.0);
}
