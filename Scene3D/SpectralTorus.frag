#version 330 core
out vec4 fragColor;
// SpectralTorus.frag — companion to SpectralTorus.vert.  Same physical-body
// language as SpectralOrb (nodal lines dark, antinodes radiant) but in a
// warmer key so the two manifold-harmonics scenes read as siblings, not
// twins.

uniform float audioSwell;
uniform float audioDrop;

in vec3  vNorm;
in vec3  vView;
in float vDefo;
in float vHue;

/**
 * @file SpectralTorus.frag
 * @brief Companion to SpectralTorus.vert. Uses the same physical-body
 * lighting language as SpectralOrb.frag (dark nodal lines, radiant
 * antinodes) but in a warmer key, so the two manifold-harmonics scenes read
 * as siblings rather than twins.
 *
 * audioSwell and audioDrop scale the antinode glow driven by the absolute
 * displacement vDefo; vHue (from SpectralTorus.vert) keys the body metal
 * tint, the glow colour and the rim colour to the current musical hue.
 */

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
    vec3 L = normalize(vec3(-0.35, 0.8, 0.5));

    float diff = max(dot(N, L), 0.0);
    float rim  = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 20.0);

    vec3 base = hueRot(vec3(0.32, 0.18, 0.11), vHue);
    vec3 col  = base * (0.35 + 0.95 * diff);

    vec3 glow = hueRot(vec3(1.0, 0.55, 0.15), vHue + 0.4);
    col += glow * pow(vDefo, 1.5) * (2.2 + 1.8 * audioSwell + 2.6 * audioDrop);

    col += vec3(1.0, 0.95, 0.85) * spec * 0.7;
    col += hueRot(vec3(0.20, 0.55, 0.95), vHue) * rim * 0.55;

    vec3 outc = col * 1.8;
    outc /= 1.0 + 0.35 * max(outc.r, max(outc.g, outc.b));
    fragColor = vec4(outc, 1.0);
}
