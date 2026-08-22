#version 330 core
out vec4 fragColor;
/**
 * @file SuperconductingVortexLatticeMelting.frag
 * @brief SUPERCONDUCTING VORTEX LATTICE MELTING: 60,000 magnetic flux quanta (Abrikosov vortices)
 * in a high-Tc cuprate superconductor. Ordered triangular vortex solid undergoes thermal melting
 * into entangled vortex liquid and vortex glass phases with photo texturing.
 *   audioAdvance -> accelerates thermal vortex fluctuations & vortex liquid drift velocity
 *   audioKick    -> flashes vortex depinning avalanches & flux-flow voltage spikes
 *   audioSwell   -> expands vortex melting puddle radius & superfluid density
 *   audioCentroid-> shifts vortex core normal-state electronic excitation spectra
 *
 * Per-activation variety:
 *   pointGainP float point sprite base luminance gain (0.5..1.8)
 *   haloP      float gaussian core halo profile width (0.6..2.2)
 */

in vec3 vCol;
in float vMeltingState;
in float vPointSize;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float pointGainP;
uniform float haloP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec2 pc = gl_PointCoord - vec2(0.5);
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;
    
    // Smooth gaussian point sprite
    float hScale = (haloP > 0.01 ? haloP : 1.2);
    float core = exp(-r2 * 18.0 / hScale);
    
    // Controlled low luminance per point sprite (V8c)
    float baseLum = (pointGainP > 0.01 ? pointGainP : 0.08) * 0.38;   // measured luma 0.021: was *0.12
    
    vec2 photoUv = fract(gl_PointCoord + vMeltingState * 0.3);
    vec3 photo = img(photoUv);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * baseLum;
    col += vec3(0.9, 0.95, 1.0) * core * baseLum * (1.0 + 0.6 * audioKick) * vMeltingState;   // round 3: still read as colour flicker at 1.4
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.03);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
