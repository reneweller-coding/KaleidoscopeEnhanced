#version 330 core
out vec4 fragColor;
/**
 * @file MajoranaNanowireBraiding.frag
 * @brief MAJORANA NANOWIRE BRAIDING: Topological quantum computing braid worldlines.
 * 1D topological superconductor nanowires undergo non-Abelian braiding permutations in 3D spacetime,
 * carrying localized Majorana zero modes at wire endpoints with photo texturing.  THREE braided
 * bundles stand side by side across the frame, over the superconducting vacuum (see the .vert).
 *   audioAdvance -> drives non-Abelian braiding worldline evolution velocity
 *   audioKick    -> flashes Majorana zero mode quantum gate operation bursts, and the
 *                   Andreev fringe in the vacuum behind them
 *   audioSwell   -> thickens topological superconducting gap & ribbon width, and opens
 *                   the braid radius
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
in float vKind;

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
    vec3 photo = img(vUV);

    // ---- BACKDROP BAND ------------------------------------------------
    // Flat and soft-edged, not a cored filament: the two wide bands are the
    // superconducting vacuum behind the braids, and they are the only layer
    // covering the whole frame.  Still an additive GL_ONE/GL_ONE pass with no
    // depth test, so it is capped well below 1.
    if (vKind > 0.5)
    {
        float band = 1.0 - pow(abs(vSide), 3.0);          // soft top/bottom edge
        vec3 bg = vCol * band * (0.62 + 0.5 * dot(photo, vec3(0.3333)));
        bg += vCol * min(audioKick * 0.30, 0.35) * band;
        fragColor = vec4(clamp(bg, 0.0, 0.34), 1.0);
        return;
    }

    float core = pow(1.0 - abs(vSide), 2.0);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);

    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * min(vMajoranaZeroMode
         * (zeroModeGlowP > 0.01 ? zeroModeGlowP : 1.4) * 2.2, 2.4);
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
