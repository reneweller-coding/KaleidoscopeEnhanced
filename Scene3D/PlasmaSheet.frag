#version 330 core
out vec4 fragColor;
// PlasmaSheet.frag — the timeless smooth plasma: three drifting sine
// fields summed and mapped through a soft palette, hue keyed to the music.
uniform float time;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioLevel;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

in vec2  vUV;
in float vH;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

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

    vec3 col = imgPalette(v * 0.5) * 1.35;

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
