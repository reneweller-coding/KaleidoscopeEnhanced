#version 330 core
/*****************************************************************************\
 *                              PhotoTunnel.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades the tunnel wall as the current slideshow image (tex0), kaleidoscope-folded into 6/8/10/12 mirrored
 *  sectors and scrolled toward the camera.
 *
 *  sceneSeed picks the sector count per activation. audioAdvance drives
 *  both the slow sector rotation and the image's inward scroll speed;
 *  audioKick and audioDrop flash the walls brighter; a luminous ring keyed
 *  to audioBarPhase sweeps down the tunnel once per bar, coloured by
 *  audioChromaHue.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// PhotoTunnel.frag — the wall texture is the CURRENT IMAGE, folded into
// kaleidoscope sectors around the tube and scrolling toward the camera.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float     sceneSeed;     ///< A random number fixed per activation.
uniform float     audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioDrop;         ///< Drop envelope: high after a detected drop, decaying.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioBarPhase;     ///< Position within the current bar, 0..1.

in vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vDist; ///< Distance (from the vertex stage).
in float vAng;  ///< Ang (from the vertex stage).

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
/**  Mirror-repeats a coordinate (a triangle wave of period 2).
 *
 * @param uv  The coordinate. (in)
 *
 * @return
 *   The folded coordinate, 0..1.
 **/
vec2 mfold( vec2 uv )
{
    return abs( fract( uv * 0.5 ) * 2.0 - 1.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    // Kaleidoscope fold around the tube: 6/8/10/12 mirrored sectors (rolled
    // per activation), slowly turning.
    float a = vAng + time * 0.10 + audioAdvance * 0.25;
    float sector = 6.2831853 / ( 6.0 + 2.0 * floor( sceneSeed * 3.999 ) );
    a = abs( mod( a, sector * 2.0 ) - sector );

    // The music scrolls the image down the tube.
    vec2 uv = vec2( a * 1.6, vUV.y * 7.0 - time * 0.30 - audioAdvance * 1.1 );
    vec3 col = img( mfold( uv ) );

    // A luminous ring sweeps through once per bar; kicks flash the walls.
    float ring = exp( -abs( fract( vUV.y * 3.0 - audioBarPhase ) - 0.5 ) * 16.0 );
    col *= 0.85 + 0.5 * audioKick + 0.9 * audioDrop + 0.55 * ring;
    col += hueRot( vec3( 0.5, 0.2, 0.6 ), audioChromaHue ) * ring * 0.35;

    col *= exp( -vDist * 0.020 ); // depth fog
    fragColor = vec4( col * 1.25, 1.0 );
}
