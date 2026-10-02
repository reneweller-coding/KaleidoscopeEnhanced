#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file LuttingerLiquidSpinChargeSeparation.frag
 * @brief LUTTINGER LIQUID SPIN-CHARGE SEPARATION: 1D quantum wire Tomonaga-Luttinger liquid.
 * Electrons split into independent holon (charge) and spinon (spin) density waves propagating
 * at different velocities along 3D ribbon channels with photo-palette interference.
 *   audioAdvance -> drives spinon/holon collective wave velocities
 *   audioKick    -> flashes electron injection quantum tunnel pulses
 *   audioSwell   -> widens 1D wire cross-section & wave amplitude
 *   audioCentroid-> shifts spin/charge color branch separation
 *
 * Per-activation variety:
 *   ribbonWidthP float quantum wire ribbon thickness       (0.02..0.1)
 *   speedRatioP  float holon-to-spinon velocity ratio      (1.2..3.0)
 *   glowP        float quantum wave excitation luminance   (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).
in float vRibbonID;
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vHolon;
in float vSpinon;

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
    float core = pow(1.0 - abs(vSide), 2.5);
    float edge = exp(-abs(abs(vSide) - 0.9) * 15.0);
    
    // Wave interference between holon and spinon modes
    float pulse = (vHolon * 0.7 + vSpinon * 0.5) * (1.0 + 2.5 * audioKick);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * core * (glowP > 0.01 ? glowP : 1.2);
    col += vec3(0.9, 0.95, 1.0) * pulse * core;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
