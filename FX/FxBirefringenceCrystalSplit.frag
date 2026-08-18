#version 330 core
out vec4 fragColor;
/**
 * @file FxBirefringenceCrystalSplit.frag
 * @brief FX BIREFRINGENCE CRYSTAL SPLIT: Calcite crystal optical birefringence transition.
 * An anisotropic uniaxial crystal splits light rays into ordinary (o-ray) and
 * extraordinary (e-ray) polarized components that separate, display polarization
 * color fringes, and recombine seamlessly into the incoming scene.
 *   interpolation -> sweeps optical crystal thickness & o/e ray displacement
 *   audioKick     -> flashes polarized isochromatic interference fringes
 *   audioBass     -> widens ordinary/extraordinary ray birefringence separation
 *
 * Per-activation variety:
 *   birefP float birefringence Delta-n separation scale (0.5..2.2)
 *   angleP float optic axis crystal orientation         (0.5..2.0)
 *   speedP float animation speed multiplier             (0.5..2.0)
 *   hueP   float polarization fringe hue offset         (0..6.28)
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
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float birefP;
uniform float angleP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float brf = (birefP > 0.0) ? birefP : 1.0;
    float ang = (angleP > 0.0) ? angleP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Optic axis orientation
    float theta = tProg * 1.5707963 * ang + t * 0.3;
    vec2 opticAxis = vec2(cos(theta), sin(theta));

    // Ordinary ray (undeviated) vs Extraordinary ray (walk-off angle)
    float walkOff = midTransition * 0.06 * brf * (1.0 + audioBass * 0.8);
    vec2 uv_o = uv;
    vec2 uv_e = uv + opticAxis * walkOff;

    // Cross-polarizer interference color: I ~ sin^2(2*theta) * sin^2(pi*Delta_n*d / lambda)
    float phaseDiff = dot(p, opticAxis) * 20.0 * brf + t * 3.0;
    vec3 isochromatic = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + phaseDiff + audioPhase);

    vec4 c1_o = texture(tex1, fract(uv_o));
    vec4 c1_e = texture(tex1, fract(uv_e));
    vec4 c0_o = texture(tex0, fract(uv_o));
    vec4 c0_e = texture(tex0, fract(uv_e));

    // Uniaxial crystal ray recombination
    vec4 c1 = (c1_o + c1_e) * 0.5;
    vec4 c0 = (c0_o + c0_e) * 0.5;

    vec4 col = mix(c1, c0, tProg);

    // Polarization interference fringe highlights.  Square before pow:
    // pow() with a negative base is undefined in GLSL (NaN -> black frame),
    // and the old 1.4+kick*3 gain overexposed the fringes.
    float sPhase = sin(phaseDiff);
    float fringeIntensity = pow(sPhase * sPhase, 4.0) * midTransition;
    col.rgb += fringeIntensity * isochromatic * (0.3 + audioKick * 0.3);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
