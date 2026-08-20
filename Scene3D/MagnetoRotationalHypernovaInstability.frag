#version 330 core
out vec4 fragColor;
/**
 * @file MagnetoRotationalHypernovaInstability.frag
 * @brief MAGNETOROTATIONAL HYPERNOVA INSTABILITY: Relativistic bipolar plasma jets launched
 * by core collapse in rapidly rotating magnetized hypernovae, wrapped by a frame-spanning
 * accretion torus and set against a far field of ejecta. Helical magnetic flux tubes,
 * Alfven wave turbulences, magnetic reconnection flares, and synchrotron photo texturing.
 *   audioAdvance -> accelerates helical magnetic jet outflow & rotation rate, and drifts the
 *                   far ejecta
 *   audioKick    -> ignites explosive magnetic reconnection flash detonations, and twinkles
 *                   the ejecta
 *   audioBass    -> pulses accretion torus diameter & magnetosphere envelope
 *   audioSwell   -> thickens relativistic plasma jet filament core glow & brightens the ejecta
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
in float vHaze;

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

    if (vHaze > 0.5)
    {
        // FAR EJECTA: the same palette, unlit and far dimmer -- a background
        // layer that fills the empty sky without lifting it toward grey.
        vec3 h = strandColor * vEnergy * (0.85 + 0.5 * audioSwell);
        h /= 1.0 + 0.35 * max(h.r, max(h.g, h.b));
        fragColor = vec4(clamp(h, 0.0, 1.0), 1.0);
        return;
    }

    // Core stellar accretion center glow
    float rCore = length(vPos.xy);
    float centralCore = exp(-dot(vPos, vPos) * 1.5) * (1.0 + 3.0 * audioKick);
    
    vec2 photoUv = fract(vPos.xy * 0.3 + 0.5);
    vec3 photoSample = img(photoUv);
    
    // Synchrotron brightness falls off along the flux tube; without a real
    // per-point gradient the whole bundle shaded to one tone.
    float axialGlow = exp(-abs(vPos.z) * 0.45);
    float rimGlow = exp(-rCore * 1.1);

    vec3 col = strandColor * (0.6 + 0.4 * photoSample) * vEnergy;
    col *= (jetGlowP > 0.01 ? jetGlowP : 1.2) * (0.8 + 0.4 * audioSwell);
    col *= 0.55 + 0.95 * (0.5 * axialGlow + 0.5 * rimGlow);
    // Capped: centralCore reaches 4 on a kick, and the core sits dead centre of
    // the frame now that the tilt no longer parks the object under the bottom
    // edge -- uncapped it flared a white disc across a twentieth of the picture.
    col += min(imgPalette(0.1) * centralCore * 2.5, vec3(1.1));
    col += strandColor * (audioKick * 0.35);
    // Magnetic reconnection flare along the tube (reconnP was declared and never
    // read -- the documented reconnection burst had no effect at all).
    float reconn = (reconnP > 0.01 ? reconnP : 1.0);
    float flare = exp(-abs(fract(vFluxIdx * 7.0 + vPos.z * 0.35 + audioAdvance * 0.2) - 0.5) * 9.0);
    col += min(imgPalette(0.62) * flare * reconn * (0.20 + 0.55 * audioKick), vec3(0.7));

    // Ceiling just under the knee's clipping point (1.47 in -> 0.97 out).
    col = min(col, vec3(1.40));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
