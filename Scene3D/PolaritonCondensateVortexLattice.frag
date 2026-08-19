#version 330 core
out vec4 fragColor;
/**
 * @file PolaritonCondensateVortexLattice.frag
 * @brief POLARITON CONDENSATE VORTEX LATTICE: 220x120 heightfield grid of an exciton-polariton
 * quantum condensate. Quantized vortices create macroscopic phase dislocations, superfluid
 * density dips, Bogoliubov phonon ripples, and dynamic photo-palette interference.
 *   audioAdvance -> integrates macroscopic polariton condensate phase evolution
 *   audioKick    -> excites quantized vortex-antivortex pair creation bursts
 *   audioSwell   -> lifts condensate wavefield height & density
 *   audioCentroid-> shifts polariton dispersion branch colors
 *
 * Per-activation variety:
 *   vortexDensityP float quantized vortex grid density     (1.0..4.0)
 *   waveHeightP    float condensate heightfield amplitude   (0.2..0.8)
 *   glowP          float superfluid luminescence brightness (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vPhase;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioValence;
uniform float audioChromaHue;

uniform float glowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.7, 0.8));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0);
    
    // Sample slideshow photo with grid coordinates
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.5 + 0.5 * photo) * (0.6 + 0.4 * diff);
    col += vec3(0.85, 0.95, 1.0) * spec * (1.0 + 2.0 * audioKick);
    col += vCol * (glowP > 0.01 ? glowP : 1.2) * (0.3 + 0.3 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
