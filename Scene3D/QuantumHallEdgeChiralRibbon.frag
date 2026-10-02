#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file QuantumHallEdgeChiralRibbon.frag
 * @brief QUANTUM HALL EDGE CHIRAL RIBBON: Topologically protected 1D chiral edge channels
 * in the integer and fractional Quantum Hall effects. Dissipationless skipping orbits,
 * quantized Hall conductance plates, ballistic wavepacket pulses, and photo texturing.
 *   audioAdvance -> accelerates chiral electron skipping orbit velocity along boundary
 *   audioKick    -> flashes quantized Hall conductance plateau transition bursts
 *   audioSwell   -> widens magnetic length & edge channel ribbon thickness
 *   audioCentroid-> shifts Landau level edge state emission spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float chiral edge state channel thickness    (0.02..0.1)
 *   edgeGlowP    float ballistic electron wavepacket luminance(0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).
in float vRibbonID;
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vChiralPulse;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float edgeGlowP;

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
    col += vec3(0.95, 0.95, 1.0) * vChiralPulse * (edgeGlowP > 0.01 ? edgeGlowP : 1.4) * 2.2;
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
