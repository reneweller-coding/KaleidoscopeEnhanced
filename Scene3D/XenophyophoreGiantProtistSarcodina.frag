#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file XenophyophoreGiantProtistSarcodina.frag
 * @brief XENOPHYOPHORE GIANT PROTIST SARCODINA: Hadal zone giant single-celled xenophyophore
 * (Syringammina fragilissima). Complex branching networks of agglutinated sediment granellare tubes,
 * streaming translucent reticulopodia plasma strands, bioelectric waves, and photo texturing.
 *   audioAdvance -> drives protoplasmic cytoplasmic streaming velocity
 *   audioKick    -> flashes bioelectric membrane depolarization waves
 *   audioSwell   -> thickens plasma vein translucency & sediment glow
 *   audioCentroid-> shifts organic bioluminescent nutrient flow spectra
 *
 * Per-activation variety:
 *   branchScaleP float reticulopodia network expansion scale (0.8..2.2)
 *   ribbonWidthP float protoplasmic vein thickness           (0.02..0.1)
 *   glowP        float bioelectric plasma tube luminance     (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).
in float vRibbonID;
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vBioPulse;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;   ///< Glow / afterglow knob, 0..1.

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
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * (glowP > 0.01 ? glowP : 1.2);
    col += vec3(0.95, 1.0, 0.9) * vBioPulse * core * 2.0;
    col += vCol * edge * 1.6;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression.  The network is drawn ADDITIVELY with no depth
    // test, and the reticulate mesh crosses itself far more often than the old
    // twenty-spoke star did, so the knee has to bite a little harder to keep
    // the crossings off the clip.
    col /= 1.0 + 0.48 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
