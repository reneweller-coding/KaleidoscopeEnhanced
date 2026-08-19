#version 330 core
out vec4 fragColor;
/**
 * @file PhotonicMetasurfacePhaseGradient.frag
 * @brief PHOTONIC METASURFACE PHASE GRADIENT: Dielectric subwavelength gradient metasurface.
 * Spatial variation of nanoantenna phase shifts implements generalized Snell's laws of reflection
 * and refraction, forming anomalous optical beams, orbital angular momentum vortices, and photo spectra.
 *   audioAdvance -> navigates phase gradient translation & orbital angular momentum beam rotation
 *   audioKick    -> flashes anomalous wavefront deflection & optical resonance burst peaks
 *   audioSwell   -> thickens nanoantenna resonant cross-section & phase discontinuity glow
 *   audioCentroid-> shifts metasurface dielectric dispersion resonance spectra
 *   audioPhase   -> twists helical wavefront phase step spiral
 *
 * Per-activation variety:
 *   gradSlopeP   float phase gradient steepness dPhi/dx         (1.0..4.0)
 *   oamChargeP   float orbital angular momentum topological charge l (1.0..5.0)
 *   antennaP     float nanoantenna array cell density           (6.0..20.0)
 *   anomalousP   float anomalous refracted beam luminance gain   (0.8..2.5)
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

uniform float gradSlopeP;
uniform float oamChargeP;
uniform float antennaP;
uniform float anomalousP;

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
    float t = time * 0.4 + audioAdvance * 0.35;
    
    float r = length(uv);
    float theta = atan(uv.y, uv.x);
    
    // Linear phase gradient along X-axis: Phi(x) = xi * x
    float xi = (gradSlopeP > 0.01 ? gradSlopeP : 2.5);
    float linPhase = uv.x * xi * 6.2831853;
    
    // Helical phase for generating Optical Vortex (Orbital Angular Momentum L)
    float l_charge = floor(oamChargeP > 0.5 ? oamChargeP : 2.0);
    float oamPhase = l_charge * theta + audioPhase * 0.5;
    
    // Combined metasurface phase profile
    float totalPhase = linPhase + oamPhase - t * 3.0;
    
    // Subwavelength nanoantenna array grid
    float gridFreq = (antennaP > 0.01 ? antennaP : 12.0);
    vec2 gridCell = fract(uv * gridFreq) - 0.5;
    float antennaMask = smoothstep(0.42, 0.32, length(gridCell));
    
    // Anomalous refracted wave (generalized Snellius beam)
    float waveFront = cos(totalPhase);
    float waveIntensity = pow(waveFront * 0.5 + 0.5, 2.0) * (anomalousP > 0.01 ? anomalousP : 1.3);
    
    // Central optical phase singularity (doughnut mode intensity null at center)
    float donutMode = (1.0 - exp(-r * r * 14.0));
    
    // Resonance flash on kick
    float resFlash = exp(-r * 8.0) * (1.0 + 3.5 * audioKick);
    
    // Palette assignment
    float palAngle = fract(totalPhase * 0.159 + audioCentroid);
    vec3 colWave = imgPalette(palAngle);
    vec3 colGrid = imgPalette(fract(palAngle + 0.5)) * 1.6;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colWave * waveIntensity * donutMode * (0.8 + 0.4 * audioSwell);
    col += colGrid * antennaMask * (0.5 + 0.5 * waveFront) * 1.2;
    col += vec3(0.9, 0.95, 1.0) * resFlash * 2.0;
    col += colWave * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
