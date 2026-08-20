#version 330 core
out vec4 fragColor;
/**
 * @file CosmicRayCherenkovAirShowerCascade.frag
 * @brief COSMIC RAY CHERENKOV AIR SHOWER CASCADE: a SKY FULL of ultra-high-energy cosmic ray
 * extensive air showers (EAS) -- 24 independent cascades laid out across the frustum at every
 * depth, over a faint upper-atmosphere airglow speck field. Relativistic secondary
 * electron/positron avalanche, nitrogen fluorescence tracks, Cherenkov light cones, and
 * atmospheric photo texturing.
 *   audioAdvance -> drives relativistic particle cascade propagation down atmospheric depth,
 *                   including the ionisation front that runs down each shower, and the slow
 *                   drift of the airglow field
 *   audioKick    -> flashes shower maximum (X_max) catastrophic ionization burst, and twinkles
 *                   the airglow
 *   audioSwell   -> widens secondary particle lateral distribution function (NKG profile) and
 *                   brightens the airglow
 *   audioCentroid-> shifts nitrogen UV fluorescence / Cherenkov blue emission spectra
 *
 * Per-activation variety:
 *   cherenkovGlowP float relativistic Cherenkov light cone luminance (0.8..2.5)
 *   fluorP         float nitrogen molecular fluorescence brightness (0.6..2.2)
 */

in vec3 vPos;
in float vDepth;
in float vGlow;

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

uniform float cherenkovGlowP;
uniform float fluorP;

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

void main() {
    // Relativistic Cherenkov blue & nitrogen UV violet identity
    vec3 cherenkovBlue = vec3(0.15, 0.75, 1.0);
    vec3 cherenkovCol  = palTint(cherenkovBlue, vDepth * 0.4 + audioCentroid, 0.25);
    
    // The field now spans tens of world units laterally, so the photo texture
    // is sampled in SCREEN-relative coordinates -- a fixed world scale would
    // have wrapped the picture dozens of times across the far cascades.
    vec2 photoUv = fract(vPos.xy / max(vPos.z, 0.5) * 0.85 + 0.5);
    vec3 photoSample = img(photoUv);

    vec3 col = cherenkovCol * (0.6 + 0.4 * photoSample) * vGlow;
    col *= (cherenkovGlowP > 0.01 ? cherenkovGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    col += vec3(0.9, 0.95, 1.0) * min(audioKick * 0.35, 0.4) * smoothstep(0.05, 0.30, vGlow);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
