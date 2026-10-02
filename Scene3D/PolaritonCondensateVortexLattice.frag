#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PolaritonCondensateVortexLattice.frag
 * @brief POLARITON CONDENSATE VORTEX LATTICE: 220x120 heightfield grid of an exciton-polariton
 * quantum condensate. Quantized vortices create macroscopic phase dislocations, superfluid
 * density dips, Bogoliubov phonon ripples, and dynamic photo-palette interference.
 *   audioAdvance -> integrates macroscopic polariton condensate phase evolution
 *   audioKick    -> excites quantized vortex-antivortex pair creation bursts
 *   audioSwell   -> lifts condensate wavefield height & density
 *   audioCentroid-> shifts polariton dispersion branch colors
 *
 * Per-activation variety:
 *   vortexDensityP float quantized vortex grid density     (1.0..4.0)
 *   waveHeightP    float condensate heightfield amplitude   (0.2..0.8)
 *   glowP          float superfluid luminescence brightness (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vPhase;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float glowP;   ///< Glow / afterglow knob, 0..1.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.7, 0.8));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0);
    
    // Sample slideshow photo with grid coordinates
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.5 + 0.5 * photo) * (0.6 + 0.4 * diff);
    col += vec3(0.85, 0.95, 1.0) * spec * (1.0 + 2.0 * audioKick);
    col += vCol * (glowP > 0.01 ? glowP : 1.2) * (0.3 + 0.3 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
