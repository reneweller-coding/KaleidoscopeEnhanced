#version 330 core
in vec3 vPos;
in float vEnergy;
in float vSpecies;

out vec4 fragColor;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float glowP;
uniform float energyP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP    > 0.0) ? glowP    : 1.0;
    float enp = (energyP  > 0.0) ? energyP  : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 circ = gl_PointCoord - vec2(0.5);
    float r = length(circ);
    if (r > 0.5) discard;

    float alpha = smoothstep(0.5, 0.05, r);

    // Particle species color (quarks=gold, muons=cyan, electrons=magenta)
    vec3 specColor = vec3(0.0);
    if (vSpecies < 0.33) {
        specColor = vec3(1.0, 0.8, 0.2); // Quarks / Gluons
    } else if (vSpecies < 0.66) {
        specColor = vec3(0.1, 0.9, 1.0); // Muons / Cherenkov
    } else {
        specColor = vec3(1.0, 0.2, 0.7); // Higgs decay cascades
    }

    // Lower gain + soft compression: thousands of additive tracks summed the
    // old x2.0 into pure white (metric scan: saturation 0.01) -- the species
    // colours only survive if a single fragment stays below clip.
    vec3 col = specColor * vEnergy * enp * glw * 0.6;
    col = col / (1.0 + 0.45 * max(col.r, max(col.g, col.b)));

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, alpha * vEnergy);
}
