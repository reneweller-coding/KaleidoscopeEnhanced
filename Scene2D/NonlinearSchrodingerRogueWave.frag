#version 330 core
out vec4 fragColor;
/**
 * @file NonlinearSchrodingerRogueWave.frag
 * @brief NONLINEAR SCHRÖDINGER ROGUE WAVE: Peregrine breather soliton / oceanic freak monster wave.
 * Non-linear modulational instability (Benjamin-Feir) focuses continuous background wave trains into
 * a sudden triple-height oceanic rogue wave wall with foaming crests and deep abyssal troughs.
 *   audioAdvance -> navigates Peregrine breather non-linear focusing spacetime coordinates
 *   audioKick    -> flashes catastrophic rogue wave breaking crest & foam detonation bursts
 *   audioBass    -> deepens preceding abyssal wave trough hole in the sea & gravitational swell
 *   audioSwell   -> widens rogue wave wall width & background wavepacket envelope
 *   audioCentroid-> shifts stormy ocean water transmission / foam scattering color spectra
 *
 * Per-activation variety:
 *   breatherScaleP float Peregrine soliton spacetime focus scale  (0.8..2.2)
 *   carrierFreqP   float background carrier wave frequency        (6.0..20.0)
 *   crestFoamP     float breaking rogue wave foam luminance gain  (0.8..2.5)
 *   troughDepthP   float abyssal trough hole depth parameter      (0.6..2.2)
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

uniform float breatherScaleP;
uniform float carrierFreqP;
uniform float crestFoamP;
uniform float troughDepthP;

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
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Spacetime coordinates around Peregrine breather focusing center (X, T)
    float bScale = (breatherScaleP > 0.01 ? breatherScaleP : 1.2);
    float X = uv.x * 3.5 * bScale;
    float T = (uv.y * 3.5 + sin(t * 0.8) * 1.5) * bScale;
    
    // Exact analytical Peregrine Breather envelope profile:
    // |Psi(X,T)| = |1 - (4*(1 + 2i*T)) / (1 + 4*X^2 + 4*T^2)|
    float denom = 1.0 + 4.0 * (X * X) + 4.0 * (T * T);
    float realPart = 1.0 - 4.0 / denom;
    float imagPart = -8.0 * T / denom;
    float envelope = sqrt(realPart * realPart + imagPart * imagPart);
    
    // Background carrier wave train modulated by envelope
    float kCarrier = (carrierFreqP > 0.01 ? carrierFreqP : 12.0);
    float carrier = cos(uv.y * kCarrier - t * 5.0 + audioPhase);
    
    float waveHeight = (envelope * carrier) * (0.85 + 0.35 * audioSwell);
    
    // Abyssal deep trough preceding rogue peak
    float trough = smoothstep(-0.5, -1.8, waveHeight) * (troughDepthP > 0.01 ? troughDepthP : 1.2) * (1.0 + 0.4 * audioBass);
    
    // Catastrophic breaking crest foam at peak envelope (where envelope reaches ~ 3.0)
    float crestFoam = pow(clamp(waveHeight * 0.45 + 0.2, 0.0, 1.0), 3.0);
    crestFoam *= (1.0 + 3.5 * audioKick) * (crestFoamP > 0.01 ? crestFoamP : 1.3);
    
    // Stormy ocean colors
    vec3 deepTrough = vec3(0.01, 0.05, 0.12);
    vec3 oceanBlue  = vec3(0.08, 0.45, 0.7);
    vec3 foamWhite  = vec3(0.92, 0.96, 1.0);
    
    vec3 waterCol = palTint(mix(deepTrough, oceanBlue, clamp(waveHeight * 0.5 + 0.5, 0.0, 1.0)), uv.y * 0.2 + audioCentroid, 0.25);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.2;
    
    vec3 col = bg + waterCol * 0.8;
    col += waterCol * max(0.0, waveHeight) * 1.5;
    col += foamWhite * crestFoam * 2.5;
    col += deepTrough * trough * 1.8;
    col += foamWhite * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
