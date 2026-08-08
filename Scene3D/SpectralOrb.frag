#version 120
// SpectralOrb.frag — companion to SpectralOrb.vert.  Lit like a physical
// resonating body: a cool key light, a warm rim, and an emissive glow that
// follows |displacement| so the ANTINODES — where the audio actually excites
// the surface — light up while the nodal lines stay dark metal.

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
    vec3 L = normalize(vec3(0.45, 0.75, 0.55));

    float diff = max(dot(N, L), 0.0);
    float rim  = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 24.0);

    // Body metal, keyed to the musical hue.
    vec3 base = hueRot(vec3(0.20, 0.28, 0.42), vHue);
    vec3 col  = base * (0.35 + 0.95 * diff);

    // Antinode glow: the vibrating regions radiate (raised power keeps the
    // nodal lines darker than the antinodes without crushing the signal).
    vec3 glow = hueRot(vec3(0.25, 0.75, 1.00), vHue + 0.6);
    col += glow * pow(vDefo, 1.5) * (2.2 + 1.8 * audioSwell + 2.6 * audioDrop);

    col += vec3(0.9, 0.95, 1.0) * spec * 0.8;
    col += hueRot(vec3(0.9, 0.45, 0.20), vHue) * rim * 0.55;

    gl_FragColor = vec4(col * 1.8, 1.0);
}
