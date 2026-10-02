#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file NonlinearLaserPlasmaWakefieldAccelerator.frag
 * @brief NONLINEAR LASER PLASMA WAKEFIELD ACCELERATOR: Laser plasma wakefield acceleration (LWFA)
 * in the non-linear bubble (blowout) regime. Relativistic laser ponderomotive force expels ambient
 * electrons, creating a spherical accelerating ion bubble with trapped GeV electron bunch injection.
 * The plasma oscillates behind the driver, so the blowout repeats as a damped TRAIN of cavities
 * down the whole channel, its sheath drawn by one strand per ribbon.  A tube can only ever be a
 * band across the picture, so the ambient gas jet the channel is bored through is drawn too:
 * twenty long ionisation filaments criss-crossing the frame at their own angles and depths.
 *   audioAdvance -> accelerates laser pulse & accelerating cavity co-moving frame drift
 *   audioKick    -> flashes relativistic electron self-injection & betatron radiation bursts
 *   audioSwell   -> widens plasma bubble blowout radius & wakefield accelerating gradient glow
 *   audioCentroid-> shifts betatron X-ray radiation emission spectra
 *
 * Per-activation variety:
 *   ribbonWidthP float plasma sheath ribbon width        (0.02..0.1)
 *   bunchGlowP   float injected electron bunch luminance (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).
in float vRibbonID;
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vBubblePulse;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float bunchGlowP;

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
    // The self-injection flash is the brightest thing here and the kick drives
    // it to 4.5x; with twenty strands ADDING over the same stretch of channel
    // it would otherwise stack into a white blob.  Cap the additive term.
    float bunch = (bunchGlowP > 0.01 ? bunchGlowP : 1.4);
    col += vec3(0.95, 0.95, 1.0) * min(vBubblePulse * bunch * 1.8, 1.9);
    col += vCol * edge * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
