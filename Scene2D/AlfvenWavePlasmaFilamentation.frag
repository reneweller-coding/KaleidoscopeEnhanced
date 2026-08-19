#version 330 core
out vec4 fragColor;
/**
 * @file AlfvenWavePlasmaFilamentation.frag
 * @brief ALFVÉN WAVE PLASMA FILAMENTATION: Torsional shear Alfvén waves in solar coronal flux tubes.
 * Magnetohydrodynamic wave propagation along magnetic field lines undergoes non-linear filamentation,
 * creating phase-mixed current sheets, turbulent plasma heating channels, and coronal photo texturing.
 *   audioAdvance -> propagates Alfvén wave packets along magnetized coronal flux tubes
 *   audioKick    -> flashes phase-mixed current sheet Joule heating reconnection bursts
 *   audioBass    -> deepens coronal flux tube guide field compression & magnetic pressure
 *   audioSwell   -> widens plasma filamentation channel thickness & thermal luminance
 *   audioCentroid-> shifts extreme ultraviolet (EUV) Fe XIV/Fe XVI emission spectra
 *
 * Per-activation variety:
 *   filamentCountP float number of filamentary plasma channels   (3.0..10.0)
 *   alfvenSpeedP   float Alfvén wave phase velocity               (0.6..2.2)
 *   jouleHeatP     float current sheet Joule heating brightness  (0.8..2.5)
 *   phaseMixP      float phase-mixing shear gradient strength    (0.5..2.2)
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

uniform float filamentCountP;
uniform float alfvenSpeedP;
uniform float jouleHeatP;
uniform float phaseMixP;

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
    
    // Magnetic guide field aligned along Y-axis
    float vA = (alfvenSpeedP > 0.01 ? alfvenSpeedP : 1.3);
    float nFil = (filamentCountP > 1.0 ? filamentCountP : 6.0);
    
    // Torsional shear Alfvén wave displacement: delta B_x(x, y, t)
    float kMix = (phaseMixP > 0.01 ? phaseMixP : 1.2);
    float alfvenPhase = uv.y * 12.0 - t * 4.0 * vA + sin(uv.x * nFil * 3.14159265 * kMix) * 2.0;
    
    float waveAmp = sin(alfvenPhase + audioPhase * 0.3) * 0.12;
    float dx = uv.x + waveAmp;
    
    // Filamentary current sheets: j_z = d(delta B_x)/dy
    float filId = floor(dx * nFil);
    float localFilX = fract(dx * nFil) - 0.5;
    float currentSheet = exp(-localFilX * localFilX * 35.0);
    
    // Phase-mixing Joule dissipation heating
    float jouleHeating = pow(abs(cos(alfvenPhase)), 2.5) * currentSheet;
    jouleHeating *= (1.0 + 3.5 * audioKick) * (jouleHeatP > 0.01 ? jouleHeatP : 1.3);
    
    // Coronal EUV plasma colors
    vec3 coronalEUV = vec3(0.1, 0.9, 0.7);
    vec3 flareAmber  = vec3(1.0, 0.45, 0.1);
    vec3 heatWhite   = vec3(1.0, 0.95, 0.9);
    
    vec3 colCorona = palTint(mix(coronalEUV, flareAmber, clamp(jouleHeating, 0.0, 1.0)), uv.y * 0.2 + audioCentroid, 0.26);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colCorona * currentSheet * (0.8 + 0.4 * audioSwell) * 1.6;
    col += heatWhite * jouleHeating * 2.4;
    col += colCorona * abs(waveAmp * 5.0) * 1.2;
    col += colCorona * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
