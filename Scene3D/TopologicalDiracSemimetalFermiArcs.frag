#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TopologicalDiracSemimetalFermiArcs.frag
 * @brief TOPOLOGICAL DIRAC SEMIMETAL FERMI ARCS: Open disjoint Fermi surface arcs in Dirac and
 * Weyl semimetals (TaAs / Cd3As2). Non-closed contours on opposite crystal surfaces connect
 * projections of bulk Weyl nodes of opposite chirality with chiral anomaly current texturing.
 * The twenty ribbons are dealt out as ten nested arcs per crystal surface -- even indices bowing
 * up out of the top face, odd ones mirroring them out of the bottom face -- so the fan opens
 * across the whole frame instead of bundling into one small knot at its centre.
 *   audioAdvance -> navigates Fermi arc surface state dispersion & Weyl node pumping
 *   audioKick    -> flashes chiral anomaly quantum Adler-Bell-Jackiw charge pumping bursts
 *   audioSwell   -> widens Fermi arc ribbon width & topological surface state glow
 *   audioCentroid-> shifts Berry curvature monopole emission spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float Fermi arc surface state ribbon width  (0.02..0.1)
 *   weylGlowP    float Weyl node chiral current luminance    (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).
in float vRibbonID;
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vWeylPulse;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float weylGlowP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * vWeylPulse * (weylGlowP > 0.01 ? weylGlowP : 1.4) * 2.2;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Ceiling just under the knee's clipping point (1.47 in -> 0.97 out).  The
    // chiral-anomaly pulse is unbounded (up to ~22 before the knee) and there
    // are twenty arcs carrying it across the whole frame now, not one small
    // bundle in the middle, so it has to be held short of flat white.
    col = min(col, vec3(1.40));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
