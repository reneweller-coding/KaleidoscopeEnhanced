#version 330 core
out vec4 fragColor;
/**
 * @file JosephsonVortexFluxonLattice.frag
 * @brief JOSEPHSON VORTEX FLUXON LATTICE: Layered high-Tc superconductor stacked Josephson junctions.
 * Sine-Gordon magnetic fluxons (Josephson vortices) driven by relativistic Lorentz currents
 * race through insulator barriers, emitting coherent terahertz Cherenkov radiation fringes.
 *   audioAdvance -> accelerates fluxon velocity towards Swihart relativistic velocity
 *   audioKick    -> flashes Josephson fluxon collision & annihilation radiation bursts
 *   audioSwell   -> widens superconducting layer thickness & terahertz field luminance
 *   audioCentroid-> shifts terahertz Josephson emission color spectra
 *   audioHigh    -> excites high-frequency Cherenkov plasma wave ripple tails
 *
 * Per-activation variety:
 *   junctionCountP float number of stacked Josephson barriers     (3.0..8.0)
 *   fluxonDensityP float magnetic fluxon soliton packing density  (2.0..6.0)
 *   thzGlowP       float terahertz Cherenkov radiation brightness (0.8..2.5)
 *   swihartSpeedP  float Swihart velocity limit parameter        (0.6..2.2)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float junctionCountP;
uniform float fluxonDensityP;
uniform float thzGlowP;
uniform float swihartSpeedP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.45 + audioAdvance * 0.4;
    
    // Stacked Josephson junction barriers along Y-axis
    float jCount = (junctionCountP > 1.0 ? junctionCountP : 5.0);
    float layerY = fract(uv.y * jCount) - 0.5;
    float layerId = floor(uv.y * jCount);
    
    // Sine-Gordon fluxon soliton chain: phi(x, t) = 4 * arctan(exp((x - v*t) / gamma))
    float vSwihart = (swihartSpeedP > 0.01 ? swihartSpeedP : 1.3);
    float fDensity = (fluxonDensityP > 0.01 ? fluxonDensityP : 3.5);
    
    // Alternating fluxon drift directions per junction layer
    float dir = mod(layerId, 2.0) == 0.0 ? 1.0 : -1.0;
    float fluxonPhase = uv.x * fDensity - t * 4.0 * vSwihart * dir + layerId * 0.35;
    
    // Sine-Gordon 2*pi phase kink profile: dPhi/dx = 2 / cosh((x - vt)/lambda_J)
    float localX = fract(fluxonPhase / 3.14159265 + 0.5) - 0.5;
    float fluxonCore = 1.0 / cosh(localX * 12.0);
    
    // Terahertz Cherenkov radiation wave tail
    float cherenkov = sin(uv.x * 22.0 - t * 8.0 * dir + audioPhase) * exp(-abs(layerY) * 6.0) * (0.6 + 0.8 * audioHigh);
    
    // Barrier insulator interface line
    float barrierLine = exp(-abs(layerY) * 30.0);
    
    // Superconducting order parameter phase
    float phi = 4.0 * atan(exp(localX * 8.0));
    
    // Radiation flash on kick
    float thzFlash = fluxonCore * (1.0 + 3.5 * audioKick) * (thzGlowP > 0.01 ? thzGlowP : 1.4);
    
    // Palette assignment
    float palAngle = fract(phi * 0.159 + layerId * 0.1 + audioCentroid);
    vec3 colFluxon = imgPalette(palAngle);
    vec3 colTHz    = imgPalette(fract(palAngle + 0.5)) * 2.0;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colFluxon * (0.5 + 0.5 * sin(phi)) * (0.8 + 0.4 * audioSwell);
    col += colTHz * fluxonCore * 1.8;
    col += vec3(0.95, 0.95, 1.0) * thzFlash * 2.0;
    col += colTHz * abs(cherenkov) * 1.2;
    col += vec3(0.7, 0.85, 1.0) * barrierLine * 1.2;
    col += colFluxon * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
