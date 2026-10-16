#version 330 core
/*****************************************************************************\
 *                              LorenzAttractorTurbulence.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades one ribbon-tube segment of the strange-attractor flow traced in LorenzAttractorTurbulence.vert: a glowing
 *  tube core whose hue Doppler-shifts from blue to magenta with the local path speed (vVelocity), overlaid with
 *  fast travelling pulse packets and a sampled strip of the current photo.
 *
 *  audioKick sharpens and brightens the travelling pulse packets;
 *  audioChromaHue, together with the hueP preset, rotates the final hue;
 *  glowP scales overall brightness. A soft-knee tone curve keeps the
 *  additive core+pulse+photo mix from clipping to white.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vPos;      ///< Position (from the vertex stage).
in float vT;        ///< T (from the vertex stage).
in float vRibbonID; ///< Ribbon ID (from the vertex stage).
in float vVelocity; ///< Velocity (from the vertex stage).
in float vSide;     ///< Which side of a strip (from the vertex stage).

uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;  ///< Glow / afterglow knob, 0..1.
uniform float trailP; ///< Trail knob, 0.5..2.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float trl = ( trailP > 0.0 ) ? trailP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Edge falloff for glowing ribbon tube look
    float edge = 1.0 - abs( vSide );
    float core_glow = pow( edge, 2.5 );

    // Velocity Doppler color gradient
    vec3 slow_col = vec3( 0.1, 0.4, 1.0 ); // Cyan / blue
    vec3 fast_col = vec3( 1.0, 0.1, 0.5 ); // Magenta / hot pink
    vec3 neon_col = mix( slow_col, fast_col, clamp( vVelocity * 0.4 - 0.2, 0.0, 1.0 ) );

    // High-speed pulse packets traveling along the ribbon
    float pulse = sin( vT * 40.0 - time * 15.0 ) * 0.5 + 0.5;
    pulse = pow( pulse, 6.0 ) * ( 1.0 + 2.0 * audioKick );

    // Photo texture modulation
    vec2 photo_uv = vec2( vT * 2.0, vRibbonID / 20.0 );
    vec3 photo_col = img( fract( photo_uv ) );

    vec3 col = ( neon_col * core_glow * 1.8 + vec3( 1.0 ) * pulse * 2.5 + photo_col * 0.4 ) * glw;
    col += vec3( 0.2, 0.6, 1.0 ) * pow( edge, 8.0 ) * 1.5; // Bright center line

    col = hueRot( col, audioChromaHue + hue );
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.55;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
