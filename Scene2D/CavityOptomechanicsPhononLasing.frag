#version 330 core
out vec4 fragColor;
/**
 * @file CavityOptomechanicsPhononLasing.frag
 * @brief CAVITY OPTOMECHANICS PHONON LASING: Optomechanical optical microcavity with movable
 * nanomechanical membrane mirrors. Radiation pressure creates parametric phonon amplification,
 * stimulated Brillouin acoustic shockwaves, laser optical frequency combs, and photo texturing.
 *   audioAdvance -> navigates optomechanical limit-cycle oscillations
 *   audioKick    -> flashes stimulated phonon-lasing threshold burst peaks
 *   audioSwell   -> widens acoustic membrane displacement amplitude
 *   audioCentroid-> shifts optical cavity laser frequency comb spectra
 *   audioHigh    -> modulates high-frequency phonon acoustic mode ripples
 *
 * Per-activation variety:
 *   cavityQ_P    float optical cavity quality factor & sharpness (1.0..3.5)
 *   phononFreqP  float mechanical membrane resonance frequency   (6.0..20.0)
 *   combP        float optical frequency comb fringe density     (8.0..24.0)
 *   pressureP    float radiation pressure coupling strength      (0.5..2.2)
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

uniform float cavityQ_P;
uniform float phononFreqP;
uniform float combP;
uniform float pressureP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Optomechanical microcavity mirrors (Fabry-Perot cavity)
    float r = length(uv);
    float theta = atan(uv.y, uv.x);
    
    // Mechanical membrane radial vibration mode (Bessel-like)
    float phononFreq = (phononFreqP > 0.01 ? phononFreqP : 12.0);
    float membraneDisp = cos(r * phononFreq - t * 3.0) * exp(-r * 1.5);
    membraneDisp *= (pressureP > 0.01 ? pressureP : 1.0) * (0.8 + 0.5 * audioSwell);
    
    // Optical cavity standing waves & frequency comb fringes
    float combFreq = (combP > 0.01 ? combP : 16.0);
    float qFactor  = (cavityQ_P > 0.01 ? cavityQ_P : 1.5);
    float cavityPhase = uv.x * combFreq + membraneDisp * 4.0 - t * 2.0;
    
    // Airy distribution (Fabry-Perot transmission resonance peaks)
    float airyPeak = 1.0 / (1.0 + qFactor * 16.0 * pow(sin(cavityPhase), 2.0));
    
    // Stimulated phonon lasing acoustic wave bursts
    float phononLasing = pow(clamp(membraneDisp * 1.5 + 0.5, 0.0, 1.0), 3.0) * (1.0 + 3.5 * audioKick);
    
    // Annular cavity mirror rings
    float mirrorRing = exp(-abs(r - 0.45) * 35.0);
    
    // Laser carrier and sideband colors
    vec3 laserCore = vec3(0.15, 0.85, 1.0);
    vec3 phononRed = vec3(1.0, 0.3, 0.1);
    vec3 combCol = palTint(mix(laserCore, phononRed, clamp(membraneDisp * 2.0 + 0.5, 0.0, 1.0)), cavityPhase * 0.15, 0.25);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += combCol * airyPeak * 2.0;
    col += palTint(vec3(0.9, 0.95, 1.0), audioCentroid, 0.2) * phononLasing * 2.2;
    col += palTint(vec3(0.6, 0.2, 0.9), t * 0.05, 0.25) * mirrorRing * 1.6;
    col += combCol * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
