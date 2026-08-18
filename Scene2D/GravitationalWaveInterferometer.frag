#version 330 core
out vec4 fragColor;
/**
 * @file GravitationalWaveInterferometer.frag
 * @brief GRAVITATIONAL WAVE INTERFEROMETER: Laser interferometer optical cavity
 * (LIGO/Virgo) with orthogonal Fabry-Pérot resonator arms and central beam
 * splitter. Quadrupolar spacetime metric strains (h_+, h_x) modulate optical
 * interference fringes, photon storage cavities, and dark-port photodiode signals.
 *   audioAdvance -> cycles laser cavity phase resonance & arm length modulation
 *   audioKick    -> passes a binary black-hole inspiral gravitational wave burst
 *   audioBass    -> undulates quadrupolar metric strain amplitude
 *   audioHigh    -> sharpens Fabry-Pérot optical cavity finesse fringes
 *
 * Per-activation variety:
 *   cavityP float interferometer arm length & mirror spacing (0.5..2.2)
 *   strainP float spacetime metric strain sensitivity        (0.5..2.0)
 *   speedP  float laser carrier phase velocity               (0.5..2.0)
 *   hueP    float Nd:YAG laser chromatic hue offset          (0..6.28)
 */

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

uniform float cavityP;
uniform float strainP;
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
    float cav = (cavityP > 0.0) ? cavityP : 1.0;
    float str = (strainP > 0.0) ? strainP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Quadrupolar gravitational wave metric strain: delta L_x = -delta L_y
    float gwFrequency = 14.0 + 8.0 * audioKick;
    float strainPlus = sin(t * gwFrequency) * 0.25 * str * (1.0 + 1.5 * audioKick + audioBass);
    float strainCross = cos(t * gwFrequency) * 0.25 * str * (1.0 + 1.5 * audioKick + audioBass);

    // Strained coordinates (quadrupolar squeeze / stretch)
    vec2 strainedUV = vec2(
        uv.x * (1.0 + strainPlus) + uv.y * strainCross,
        uv.y * (1.0 - strainPlus) + uv.x * strainCross
    );

    // Orthogonal Fabry-Pérot resonant cavity arms (X and Y axes)
    float armX = exp(-abs(strainedUV.y) * 40.0 / cav);
    float armY = exp(-abs(strainedUV.x) * 40.0 / cav);

    // Optical interference fringes: delta phi = 4 pi (L_x - L_y) / lambda
    float deltaL = (strainedUV.x * strainedUV.x - strainedUV.y * strainedUV.y) * 20.0 * cav;
    float fringes = sin(deltaL + t * 6.0 + audioPhase * 4.0);
    float fringeIntensity = smoothstep(-0.2, 0.9, fringes);

    // Central beam splitter 45-degree mirror
    float beamSplitter = exp(-abs(uv.x + uv.y) * 35.0);

    // Dark-port destructive interference readout flash on kick
    float darkPortFlash = (1.0 - fringeIntensity) * (audioKick * 3.5 + audioHigh * 1.5);

    // Photo texture mapping on dielectric mirror coatings
    vec2 photoUV = st + vec2(strainPlus, -strainPlus) * 0.05;
    vec3 photo = img(fract(photoUV));

    // Nd:YAG 1064nm infrared laser & green frequency doubled palette
    vec3 laserGreen = vec3(0.1, 1.0, 0.4);
    vec3 laserIR    = vec3(1.0, 0.2, 0.4);
    vec3 beamWhite  = vec3(0.95, 1.0, 0.9);

    vec3 col = photo * 0.75 * (0.8 + 0.3 * audioLevel);
    col += (armX + armY) * laserGreen * (1.0 + audioSwell * 0.8);
    col += fringeIntensity * laserIR * 1.2;
    col += beamSplitter * beamWhite * 1.6;
    col += darkPortFlash * vec3(1.0, 0.95, 0.5) * 1.5;

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, length(uv));
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
