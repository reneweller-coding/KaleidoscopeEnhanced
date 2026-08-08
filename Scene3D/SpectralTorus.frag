#version 120
// SpectralTorus.frag — companion to SpectralTorus.vert.  Same physical-body
// language as SpectralOrb (nodal lines dark, antinodes radiant) but in a
// warmer key so the two manifold-harmonics scenes read as siblings, not
// twins.

uniform float audioSwell;
uniform float audioDrop;

varying vec3  vNorm;
varying vec3  vView;
varying float vDefo;
varying float vHue;

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

    vec3 base = hueRot(vec3(0.22, 0.12, 0.08), vHue);
    vec3 col  = base * (0.25 + 0.9 * diff);

    vec3 glow = hueRot(vec3(1.0, 0.55, 0.15), vHue + 0.4);
    col += glow * vDefo * vDefo * (0.9 + 1.2 * audioSwell + 1.8 * audioDrop);

    col += vec3(1.0, 0.95, 0.85) * spec * 0.7;
    col += hueRot(vec3(0.20, 0.55, 0.95), vHue) * rim * 0.55;

    gl_FragColor = vec4(col * 1.6, 1.0);
}
