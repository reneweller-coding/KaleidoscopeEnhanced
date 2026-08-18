#version 330 core
out vec4 fragColor;
// JosephsonVortexLattice.frag
// -----------------------------------------------------------------------
// JOSEPHSON VORTEX LATTICE: High-temperature layered superconductor
// Josephson junction array simulating quantized fluxon vortex lattices.
// Cooper-pair phase isobars, vortex liquid melting transitions, soliton
// wave packets, and quantum phase photo mapping.
//   audioAdvance -> drives fluxon motion across superconductor layers
//   audioKick    -> triggers vortex lattice melting into turbulent fluid
//   audioBass    -> pulses Josephson plasma resonance frequency
//   audioChromaHue-> rotates superconducting phase color spectrum
//
// Per-activation variety:
//   latticeP float fluxon vortex lattice density      (0.5..2.2)
//   vortexP  float vortex core circulating intensity  (0.5..2.0)
//   speedP   float fluxon drift velocity              (0.5..2.0)
//   hueP     float phase palette hue offset           (0..6.28)
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

uniform float latticeP;
uniform float vortexP;
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

void main() {
    float ltc = (latticeP > 0.0) ? latticeP : 1.0;
    float vrt = (vortexP  > 0.0) ? vortexP  : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.2;

    // Hexagonal / Triangular Abrikosov-Josephson lattice coordinates
    vec2 p = uv * 6.5 * ltc;
    p.x += t * 1.5;

    // Sine-Gordon soliton phase waves: phi(x,y)
    float phi1 = sin(p.x + sin(p.y * 1.5 + t) * 1.2 * vrt);
    float phi2 = cos(p.y + sin(p.x * 1.5 - t) * 1.2 * vrt);
    float phaseField = atan(phi2, phi1);

    // Quantized vortex cores (zeros of superconducting order parameter)
    float coreGrid = abs(sin(p.x * 0.866 + p.y * 0.5) * sin(p.x * 0.866 - p.y * 0.5) * sin(p.y));
    float vortexCores = exp(-coreGrid * 15.0) * (1.0 + audioKick * 2.5);

    // Superconducting phase isobars (interference lines)
    float isobars = sin(phaseField * 12.0 + audioPhase * 4.0);
    float lines = smoothstep(0.65, 0.95, abs(isobars));

    // Photo texture mapping modulated by phase gradient
    vec2 phaseGrad = vec2(phi1, phi2) * 0.04 * (1.0 + audioKick * 0.8);
    vec3 photo = img(fract(st + phaseGrad));

    // Quantum phase palette
    vec3 phaseColor = imgPalette((phaseField + audioPhase) * 0.159);

    // Combine visualizer
    vec3 col = mix(photo * 0.85, phaseColor, 0.45 + 0.25 * audioSwell);
    col += lines * vec3(0.2, 0.9, 1.0) * (0.8 + audioHigh * 1.2);
    col += vortexCores * vec3(1.0, 0.85, 0.3) * (1.5 + audioKick * 2.0);

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.3, 0.35, length(uv));
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.65;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
