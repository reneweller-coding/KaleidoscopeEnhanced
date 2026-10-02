#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CosmicWebFilamentAnisotropy.frag
 * @brief COSMIC WEB FILAMENT ANISOTROPY: 60,000-particle large-scale dark matter structure
 * spanning the whole frustum. Intersecting cosmic web filaments connect massive galaxy cluster
 * nodes with soft halo glow, over a far-field void glow that carries the empty corners,
 * gravitational lens distortions, and photo-derived cosmological spectra.
 *   audioAdvance -> drives cosmic expansion & large-scale structure flow, and the drift of the
 *                   void glow
 *   audioKick    -> flashes gravitational cluster merger shockwaves
 *   audioSwell   -> enriches cosmic void background illumination
 *   audioCentroid-> shifts dark matter halo potential well colors
 *
 * Per-activation variety:
 *   pointGainP float particle luminosity gain              (0.5..1.8)
 *   haloP      float cluster node halo brightness           (0.6..2.2)
 */

in vec3 vCol;   ///< Colour (from the vertex stage).
in float vDensity;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float pointGainP;
uniform float haloP;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    // Radial sprite falloff (GL_POINTS only)
    vec2 pt = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(pt, pt);
    if (r2 > 1.0) discard;
    
    float spriteGlow = exp(-r2 * 3.5);

    // The per-particle level is decided in the .vert (filament particles carry
    // their node density, void-glow particles their own dimmer gain), so this
    // stage only applies the sprite profile and the preset gains.  The old
    // fixed 0.06 base was calibrated for a scene where all 60k points piled
    // into one small blob; spread across the frustum it left the frame black.
    float gain = 0.5 + 0.5 * clamp((pointGainP > 0.01 ? pointGainP : 1.0), 0.5, 1.8);
    vec3 col = vCol * spriteGlow * gain * (0.8 + 0.4 * audioSwell);
    // Merger shockwave: a bounded halo on the dense cluster nodes only.
    col += vCol * spriteGlow * vDensity
         * clamp((haloP > 0.01 ? haloP : 1.0), 0.6, 2.2) * min(audioKick * 0.45, 0.55);

    // Ceiling just under the knee's clipping point (1.47 in -> 0.97 out): 60k
    // additive sprites now cover the whole frame instead of one small blob, so a
    // bright photo palette must not be able to flatten their cores to white.
    col = min(col, vec3(1.40));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
