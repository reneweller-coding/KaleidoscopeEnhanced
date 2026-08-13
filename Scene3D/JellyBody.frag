#version 330 core
out vec4 fragColor;
// JellyBody.frag — translucent wobbling jelly: deep saturated body colour,
// strong fresnel rim (the classic gummy look), wet specular, and a subtle
// subsurface glow that brightens where the body is currently deformed —
// the ring-down becomes visible as travelling light.

uniform float audioSwell;
uniform float audioDrop;

in vec3  vNorm;
in vec3  vView;
in float vDefo;
in float vHue;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec3 N = normalize(vNorm);
    vec3 V = normalize(vView);
    vec3 L = normalize(vec3(0.4, 0.8, 0.5));

    float diff = max(dot(N, L), 0.0);
    float fres = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 2.2);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 42.0);

    // Deep jelly body, keyed to the music.
    vec3 body = hueRot(vec3(0.55, 0.10, 0.28), vHue);
    vec3 col  = body * (0.30 + 0.75 * diff);

    // Subsurface: light seems to pool where the body is deformed.
    col += hueRot(vec3(1.0, 0.45, 0.55), vHue) * vDefo
         * (0.8 + 1.0 * audioSwell + 1.6 * audioDrop);

    // Gummy rim + wet highlight.
    col += hueRot(vec3(1.0, 0.6, 0.75), vHue) * fres * 0.9;
    col += vec3(1.0) * spec * 1.1;

    fragColor = vec4(col * 1.7, 1.0);
}
