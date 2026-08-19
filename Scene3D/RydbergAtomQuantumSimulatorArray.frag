#version 330 core
out vec4 fragColor;
/**
 * @file RydbergAtomQuantumSimulatorArray.frag
 * @brief RYDBERG ATOM QUANTUM SIMULATOR ARRAY: 60,000 neutral alkali atoms trapped in a 3D optical
 * tweezer array. Laser driving to high principal quantum number Rydberg states (n ~ 70) creates
 * strong Van der Waals Rydberg blockade interactions, crystalline quantum states, and photo texturing.
 *   audioAdvance -> navigates Rabi frequency detuning & quantum simulator adiabatic sweeps
 *   audioKick    -> flashes collective Rydberg excitation & quantum Zeno blockade avalanches
 *   audioSwell   -> widens Rydberg blockade radius sphere & atom cloud fluorescence
 *   audioCentroid-> shifts atomic D2 line / Rydberg laser transition color spectra
 *
 * Per-activation variety:
 *   pointGainP float point sprite base luminance gain (0.5..1.8)
 *   haloP      float gaussian atom core halo profile  (0.6..2.2)
 */

in vec3 vCol;
in float vBlockade;
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
    
    float hScale = (haloP > 0.01 ? haloP : 1.2);
    float core = exp(-r2 * 18.0 / hScale);
    
    // Controlled low luminance per point sprite (V8c)
    float baseLum = (pointGainP > 0.01 ? pointGainP : 0.08) * 0.12;
    
    vec2 photoUv = fract(gl_PointCoord + vBlockade * 0.3);
    vec3 photo = img(photoUv);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * baseLum;
    col += vec3(0.95, 0.95, 1.0) * core * baseLum * (1.0 + 3.0 * audioKick) * vBlockade;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.03);
    
    // additive pass dim: this geom renders GL_ONE/GL_ONE without
    // depth -- overlapping layers ADD, so each fragment must stay
    // well below 1.0 or the stack burns to white.
    col *= 0.35;

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
