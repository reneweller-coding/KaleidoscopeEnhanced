#version 330 core
out vec4 fragColor;
/**
 * @file MagnetoRotationalHypernovaInstability.frag
 * @brief MAGNETOROTATIONAL HYPERNOVA INSTABILITY: Relativistic bipolar plasma jets launched
 * by core collapse in rapidly rotating magnetized hypernovae. Helical magnetic flux tubes,
 * Alfven wave turbulences, magnetic reconnection flares, and synchrotron photo texturing.
 *   audioAdvance -> accelerates helical magnetic jet outflow & rotation rate
 *   audioKick    -> ignites explosive magnetic reconnection flash detonations
 *   audioBass    -> pulses accretion torus diameter & magnetosphere envelope
 *   audioSwell   -> thickens relativistic plasma jet filament core glow
 *   audioCentroid-> shifts synchrotron radiation emission spectra
 *
 * Per-activation variety:
 *   jetGlowP  float plasma jet filament luminance          (0.8..2.5)
 *   reconnP   float magnetic reconnection burst intensity   (0.5..2.2)
 *   coreRadP  float stellar core accretion torus brightness (0.6..2.0)
 */

in vec3 vPos;
in float vFluxIdx;
in float vEnergy;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float jetGlowP;
uniform float reconnP;

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

void main() {
    float palCoord = fract(vFluxIdx + abs(vPos.z) * 0.2 + audioCentroid);
    vec3 strandColor = imgPalette(palCoord);
    
    // Core stellar accretion center glow
    float rCore = length(vPos.xy);
    float centralCore = exp(-dot(vPos, vPos) * 1.5) * (1.0 + 3.0 * audioKick);
    
    vec2 photoUv = fract(vPos.xy * 0.3 + 0.5);
    vec3 photoSample = img(photoUv);
    
    vec3 col = strandColor * (0.6 + 0.4 * photoSample) * vEnergy;
    col *= (jetGlowP > 0.01 ? jetGlowP : 1.2) * (0.8 + 0.4 * audioSwell);
    col += imgPalette(0.1) * centralCore * 2.5;
    col += strandColor * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
