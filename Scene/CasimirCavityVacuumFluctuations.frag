#version 330 core
out vec4 fragColor;
// CasimirCavityVacuumFluctuations.frag
// -----------------------------------------------------------------------
// CASIMIR CAVITY VACUUM FLUCTUATIONS: Nanoscale optical cavity between two
// reflecting mirrors displaying zero-point quantum field fluctuations,
// dynamical Casimir photon pair production, standing-wave mode quantization,
// and thin-film dielectric photo reflections.
//   audioAdvance -> drives vacuum electromagnetic field mode evolution
//   audioKick    -> triggers dynamical Casimir photon pair creation flashes
//   audioSubBass -> modulates nanoscale cavity gap distance
//   audioHigh    -> excites high-frequency ultraviolet quantum modes
//
// Per-activation variety:
//   gapP    float cavity plate separation gap        (0.5..2.2)
//   fluctP  float vacuum fluctuation amplitude       (0.5..2.0)
//   speedP  float quantum phase evolution velocity   (0.5..2.0)
//   hueP    float dielectric color hue offset        (0..6.28)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float gapP;
uniform float fluctP;
uniform float speedP;
uniform float hueP;

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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// 2D Noise hash
float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.21));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

void main() {
    float gp  = (gapP   > 0.0) ? gapP   : 1.0;
    float flc = (fluctP > 0.0) ? fluctP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Dynamic cavity gap spacing
    float cavityGap = (0.45 + 0.15 * sin(t * 0.8) + 0.2 * audioSubBass) * gp;

    // Quantized cavity standing wave modes: sin(n * pi * x / L)
    float standingModes = 0.0;
    for (float n = 1.0; n <= 6.0; ++n) {
        float k = n * 3.14159 / cavityGap;
        float wave = sin(uv.y * k + t * n * 0.8) * cos(uv.x * k * 0.7 - t * n * 0.5);
        standingModes += wave / n;
    }

    // Zero-point vacuum fluctuations (multi-octave stochastic field)
    vec2 qCoord = uv * 14.0;
    float vac1 = noise2D(qCoord + vec2(t * 2.0, -t * 1.5));
    float vac2 = noise2D(qCoord * 2.0 - vec2(t * 3.0, t * 2.5));
    float vac3 = noise2D(qCoord * 4.0 + vec2(-t * 4.0, t * 3.5));
    float vacFluct = (vac1 + vac2 * 0.5 + vac3 * 0.25) * flc;

    // Dynamical Casimir photon pair creation sparks on kick
    float pairCreation = pow(noise2D(uv * 25.0 + t * 5.0), 4.0) * (audioKick * 4.0 + audioHigh * 2.0);

    // Dielectric mirror reflection photo mapping
    vec2 photoUV = st + vec2(sin(uv.y * 10.0 + standingModes), cos(uv.x * 10.0 - standingModes)) * 0.03 * flc;
    vec3 photo = img(fract(photoUV));

    // Quantum vacuum palette (deep indigo, electric cyan, violet-gold)
    vec3 vacColor = imgPalette(0.30 * vacFluct) * (0.5 + 1.0 * vacFluct);
    vacColor += standingModes * vec3(0.5, 0.2, 0.8) * (1.0 + audioSwell);

    // Combine visualizer
    vec3 col = mix(photo * 0.8, vacColor, 0.5 + 0.2 * audioLevel);
    col += pairCreation * vec3(1.0, 0.95, 0.85);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Cavity edge mirrors
    float edgeMirror = smoothstep(0.0, 0.15, abs(uv.y) - cavityGap * 0.8);
    col = mix(col, vec3(0.9, 0.95, 1.0) * (photo + 0.3), edgeMirror * 0.4);

    fragColor = vec4(col, 1.0);
}
