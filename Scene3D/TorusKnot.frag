#version 330 core
out vec4 fragColor;
// TorusKnot.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file TorusKnot.frag
 * @brief Additive glow-sprite shader for the two streaming (p,q) torus-knot
 * particle curves and the ember field around them: renders each of the 60k
 * flowing points as a bright round point of light.
 *
 * No audio uniforms are read here; every mapping is computed in the companion
 * vertex shader (TorusKnot.vert) and arrives pre-baked in vCol.
 *
 * Audio Reactivity (all applied in TorusKnot.vert):
 *   audioAdvance   -> flow of the particles along both closed curves + the
 *                     drift of the ember haze
 *   audioBass      -> tube breath
 *   audioSwell     -> overall glow of the knots and the embers
 *   audioChromaHue -> hue sweep along the knot (musical key)
 *   audioMidRel    -> tube punch, self-normalising to any mix
 *   audioSpread    -> dispersion off the curve (clean line vs haze) and how
 *                     wide the ember field opens
 *   audioMode      -> colour temperature (minor = blue, major = ember orange)
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a * 2.0, 1.0);
}
