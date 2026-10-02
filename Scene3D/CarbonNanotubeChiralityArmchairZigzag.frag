#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CarbonNanotubeChiralityArmchairZigzag.frag
 * @brief CARBON NANOTUBE CHIRALITY ARMCHAIR ZIGZAG: Single-walled carbon nanotube (SWCNT)
 * network -- seven crossing tubes of a buckypaper mat, each with a tunable chiral vector
 * (n,m). Armchair, zigzag, and chiral helicities with
 * ballistic 1D pi-electron conduction pulses, metallic sp2 luster, and photo texturing.
 *   audioAdvance -> drives ballistic pi-electron current drift & tube rotation
 *   audioKick    -> flashes 1D Van Hove singularity electronic transition bursts
 *   audioSwell   -> thickens carbon nanotube diameter & metallic conduction sheen
 *   audioCentroid-> shifts chiral nanotube optical absorption spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float nanotube ribbon wall thickness        (0.02..0.1)
 *   conductGlowP float ballistic electron pulse luminance    (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).
in float vRibbonID;
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vConductPulse;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float conductGlowP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    // The quad is wider than the sp2 wall: |s| < 0.38 is the carbon ribbon
    // itself, everything outside it is the metallic sheen around it.
    float s    = abs(vSide);
    float core = pow(max(0.0, 1.0 - s / 0.38), 2.2);
    float edge = exp(-abs(s - 0.32) * 24.0);
    float sheen = exp(-s * 2.3) * 0.15;

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * core * 1.3;
    col += vec3(0.95, 0.95, 1.0) * vConductPulse * (conductGlowP > 0.01 ? conductGlowP : 1.4)
         * 2.2 * (core + 0.30 * sheen);
    col += vCol * edge * 1.4;
    col += vCol * sheen * (0.85 + 0.55 * audioSwell);
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3) * (core + sheen);

    // Additive geometry: cap the tinted vec3, then soft-knee it
    col = min(col, vec3(1.5));
    col /= 1.0 + 0.45 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
