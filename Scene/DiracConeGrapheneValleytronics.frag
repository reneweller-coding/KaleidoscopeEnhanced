#version 330 core
out vec4 fragColor;
// DiracConeGrapheneValleytronics.frag
// -----------------------------------------------------------------------
// DIRAC CONE GRAPHENE VALLEYTRONICS: 2D honeycomb carbon lattice displaying
// linear relativistic Dirac cones (E = +/- hbar * v_F * |k|). Valley Hall
// pseudospin states (K and K' valleys), Berry curvature flux, quantum
// wavepacket tunneling, and continuous photo texture reflections.
//   audioAdvance -> drives electronic wavepacket drift across K/K' valleys
//   audioKick    -> flashes inter-valley quantum tunneling & plasmonic bursts
//   audioBass    -> undulates Fermi energy surface and Dirac cone slope
//   audioChromaHue-> shifts valley pseudospin polarization colors
//
// Per-activation variety:
//   coneP   float Dirac cone dispersion slope scale      (0.5..2.2)
//   valleyP float K/K' valley polarization asymmetry     (0.5..2.0)
//   speedP  float electronic transport drift velocity    (0.5..2.0)
//   hueP    float plasmonic spectrum chromatic offset    (0..6.28)
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

uniform float coneP;
uniform float valleyP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float cne = (coneP   > 0.0) ? coneP   : 1.0;
    float vly = (valleyP > 0.0) ? valleyP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Hexagonal reciprocal space k-vector lattice
    vec2 kCoord = uv * 6.5 * cne;

    // K and K' valley node coordinates (hexagonal symmetry)
    float h1 = sin(kCoord.x + t * 2.0);
    float h2 = sin(-0.5 * kCoord.x + 0.866 * kCoord.y - t);
    float h3 = sin(-0.5 * kCoord.x - 0.866 * kCoord.y - t);
    float hexBand = sqrt(h1 * h1 + h2 * h2 + h3 * h3);

    // Conical Dirac cone dispersion: E = |k - K|
    float diracEnergy = hexBand;
    float fermiLevel = (0.45 + 0.15 * sin(t * 1.5) + 0.2 * audioBass);
    float fermiSurface = exp(-abs(diracEnergy - fermiLevel) * 20.0);

    // Valley pseudospin asymmetry (K vs K' polarization)
    float valleyPolarization = sin(kCoord.x * 2.0 + kCoord.y * 3.464 + t * 3.0) * vly;

    // Berry curvature flux peaks around Dirac points
    float berryCurvature = exp(-hexBand * 12.0) * (1.0 + audioKick * 3.0);

    // Photo texture mapping onto Dirac Fermi contours
    vec2 photoUV = st + vec2(h1, h2) * 0.03 * (1.0 + audioKick * 0.7);
    vec3 photo = img(fract(photoUV));

    // Valley polarization colors: K valley (Emerald/Cyan), K' valley (Magenta/Gold)
    vec3 valleyK  = vec3(0.0, 0.95, 0.6);
    vec3 valleyK2 = vec3(1.0, 0.2, 0.7);
    vec3 berryGlow = vec3(1.0, 0.95, 0.4);

    vec3 valleyCol = mix(valleyK, valleyK2, valleyPolarization * 0.5 + 0.5);

    // Combine visualizer
    vec3 col = mix(photo * 0.8, valleyCol, 0.45 + 0.25 * audioSwell);
    col += fermiSurface * vec3(0.3, 0.85, 1.0) * (1.0 + audioHigh * 1.2);
    col += berryCurvature * berryGlow * 2.2;

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, length(uv));
    col *= vig;

    fragColor = vec4(col, 1.0);
}
