#version 330 core
out vec4 fragColor;
/**
 * @file RadiolarianMicrotubuleExoskeleton.frag
 * @brief RADIOLARIAN MICROTUBULE EXOSKELETON: Intricate geometric silica micro-exoskeleton
 * of deep-sea radiolaria. 3D compute-generated porous icosahedral lattices, radiating axopodia
 * spicules, iridescent biosilica glass refraction, and photo texturing.
 *   audioAdvance -> rotates silica skeleton lattice & axopodia fluid flow
 *   audioKick    -> flashes cytoplasmic bioluminescence & spicule tip glints
 *   audioSwell   -> swells concentric icosahedral shell radius & strut thickness
 *   audioCentroid-> shifts biosilica opal dispersion colors
 *
 * Per-activation variety:
 *   silicaGlowP float glass strut luminance               (0.8..2.5)
 *   opalP       float thin-film opal iridescence intensity (0.5..2.2)
 */

in vec3 vPos;
in float vRadius;
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

uniform float silicaGlowP;
uniform float opalP;

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
    // Glass opal silica color
    vec3 opalSilica = vec3(0.75, 0.9, 1.0);
    vec3 silicaCol = palTint(opalSilica, vRadius * 0.3 + audioCentroid, 0.22);
    
    vec2 photoUv = fract(vPos.xy * 0.25 + 0.5);
    vec3 photoSample = img(photoUv);
    
    vec3 col = silicaCol * (0.6 + 0.4 * photoSample) * vGlow;
    col *= (silicaGlowP > 0.01 ? silicaGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    col += silicaCol * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
