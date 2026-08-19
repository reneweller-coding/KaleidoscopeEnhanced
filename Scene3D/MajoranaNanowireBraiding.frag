#version 330 core
out vec4 fragColor;
/**
 * @file MajoranaNanowireBraiding.frag
 * @brief MAJORANA NANOWIRE BRAIDING: Topological quantum computing braid worldlines.
 * 1D topological superconductor nanowires undergo non-Abelian braiding permutations in 3D spacetime,
 * carrying localized Majorana zero modes at wire endpoints with photo texturing.
 *   audioAdvance -> drives non-Abelian braiding worldline evolution velocity
 *   audioKick    -> flashes Majorana zero mode quantum gate operation bursts
 *   audioSwell   -> thickens topological superconducting gap & ribbon width
 *   audioCentroid-> shifts non-Abelian quantum state phase spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float nanowire ribbon thickness             (0.02..0.1)
 *   braidSpeedP  float non-Abelian braiding worldline speed  (0.6..2.5)
 *   zeroModeGlowP float Majorana zero mode endpoint brightness(0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vMajoranaZeroMode;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float zeroModeGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.0);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * vMajoranaZeroMode * (zeroModeGlowP > 0.01 ? zeroModeGlowP : 1.4) * 2.2;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
