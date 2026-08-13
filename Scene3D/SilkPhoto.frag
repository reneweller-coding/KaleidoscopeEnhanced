#version 330 core
out vec4 fragColor;
// SilkPhoto.frag — the photo itself, recognisable, with cloth shading and a
// silky key-coloured sheen wandering across the folds.
uniform sampler2D tex0;
uniform float time;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioDrop;

in vec2  vUV;
in float vShade;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec3 col = texture(tex0, vec2(vUV.x, 1.0 - vUV.y)).rgb;

    col *= vShade;

    // Silk sheen: a soft diagonal highlight strolling over the fabric.
    float sheen = exp(-abs(fract(vUV.x * 0.9 - vUV.y * 0.4 - time * 0.07)
                           - 0.5) * 9.0);
    col += hueRot(vec3(0.30, 0.28, 0.35), audioChromaHue) * sheen
         * (0.5 + 0.6 * audioSwell);

    col *= 1.0 + 0.8 * audioDrop;

    fragColor = vec4(col * 1.15, 1.0);
}
