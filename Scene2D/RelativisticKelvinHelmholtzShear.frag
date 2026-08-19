#version 330 core
out vec4 fragColor;
/**
 * @file RelativisticKelvinHelmholtzShear.frag
 * @brief RELATIVISTIC KELVIN-HELMHOLTZ SHEAR: Relativistic shear instability at the boundary of
 * collimated astrophysical radio jets. Fast internal plasma flow past ambient medium generates
 * non-linear cat's-eye vortex trains, magnetic field compression ribbons, and synchrotron glow.
 *   audioAdvance -> drives relativistic jet shear flow velocity & vortex rolling
 *   audioKick    -> flashes magnetic reconnection & synchrotron shock detonation bursts
 *   audioBass    -> undulates jet boundary shear layer width & vortex core diameter
 *   audioSwell   -> enriches relativistic plasma density & synchrotron halo glow
 *   audioCentroid-> shifts relativistic synchrotron emission spectra (radio to X-ray)
 *
 * Per-activation variety:
 *   vortexTrainP float number of Kelvin-Helmholtz cat's-eye vortices (3.0..8.0)
 *   shearThickP  float shear layer transition thickness             (0.4..1.8)
 *   synchGlowP   float synchrotron magnetic shockwave luminance     (0.8..2.5)
 *   jetSpeedP    float relativistic bulk Lorentz factor gamma       (0.6..2.2)
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

uniform float vortexTrainP;
uniform float shearThickP;
uniform float synchGlowP;
uniform float jetSpeedP;

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
    float t = time * 0.45 + audioAdvance * 0.4;
    
    // Relativistic shear layer at y = 0
    float vGamma = (jetSpeedP > 0.01 ? jetSpeedP : 1.3);
    float nVortices = (vortexTrainP > 1.0 ? vortexTrainP : 5.0);
    
    float kX = uv.x * nVortices * 3.14159265 - t * 3.5 * vGamma;
    float thick = (shearThickP > 0.01 ? shearThickP : 1.0) * (0.85 + 0.35 * audioBass);
    
    // Stuart cat's-eye vortex stream function: psi(x, y) = ln(cosh(y/Delta) - C * cos(k*x))
    float coshY = cosh(uv.y * 5.0 / thick);
    float cosKX = cos(kX + audioPhase * 0.3);
    float catEye = (coshY - 0.65 * cosKX);
    
    // Vorticity magnitude ~ Laplacian of psi
    float vorticity = 1.0 / max(catEye, 0.15);
    
    // Compressed magnetic field ribbons around vortex eyes
    float bRibbon = exp(-abs(fract(catEye * 1.5) - 0.5) * 12.0);
    
    // Synchrotron emission flash on kick
    float synchFlash = pow(clamp(vorticity * 0.4, 0.0, 1.0), 3.0) * (1.0 + 3.5 * audioKick) * (synchGlowP > 0.01 ? synchGlowP : 1.3);
    
    // Relativistic jet plasma colors
    vec3 jetPlasma  = vec3(0.15, 0.75, 1.0);
    vec3 ambientGas = vec3(0.9, 0.3, 0.1);
    vec3 synchWhite = vec3(1.0, 0.95, 0.85);
    
    vec3 colShear = palTint(mix(jetPlasma, ambientGas, clamp(uv.y * 2.0 + 0.5, 0.0, 1.0)), kX * 0.1 + audioCentroid, 0.26);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colShear * (vorticity * 0.35) * (0.8 + 0.4 * audioSwell);
    col += synchWhite * synchFlash * 2.2;
    col += palTint(vec3(0.3, 0.9, 1.0), t * 0.05, 0.22) * bRibbon * 1.6;
    col += colShear * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
