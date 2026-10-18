#version 330 core
/*****************************************************************************\
 *                              KaleidoDome.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Renders a spinning kaleidoscope rosette of the current slideshow photo projected onto a dome, folded into
 *  8/10/12/14 mirrored sectors chosen per activation from sceneSeed.
 *
 *  audioAdvance drives both the sector spin and a slow radial creep across
 *  the source image so the crop never repeats; audioSwell breathes the
 *  sampled radius; audioKick blooms the dome's centre and audioDrop
 *  flashes the whole sky; audioChromaHue tints the glowing sector seams.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// KaleidoDome.frag — a 10-sector kaleidoscope rosette of the current image
// spinning across the dome; kicks bloom the centre, the bar phase breathes
// the fold radius.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float     sceneSeed;     ///< A random number fixed per activation.
uniform float     audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioDrop;         ///< Drop envelope: high after a detected drop, decaying.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

in vec2  vUV; ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vR;  ///< R (from the vertex stage).

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
    // Rosette: fold the dome angle into 8/10/12/14 mirrored sectors (rolled
    // per activation), spin with the music; the radius breathes with the swell.
    float ang = atan( vUV.y, vUV.x ) + time * 0.06 + audioAdvance * 0.30;
    float sector = 6.2831853 / ( 8.0 + 2.0 * floor( sceneSeed * 3.999 ) );
    ang = abs( mod( ang, sector * 2.0 ) - sector );

    float r = vR * ( 1.15 + 0.20 * audioSwell ) + 0.06 * time
              + 0.20 * audioAdvance;

    // Map the folded angle ACROSS the sector to one texture axis and the
    // radius to the other — every wedge shows a real 2D crop of the image.
    // (The old dir(ang)*r sampling collapsed each wedge onto a thin ray
    // through the texture: the image smeared into long radial streaks.)
    vec2 crop = vec2( sceneSeed * 3.7, sceneSeed * 7.3 );
    vec2 uv = vec2( ang / sector * 1.6 + crop.x,
                    r * 0.9 + crop.y );
    vec3 col = img( mfold( uv ) );

    // Centre bloom on the kick, whole-sky flash on a drop.
    float centre = exp( -vR * 2.2 );
    col *= 0.80 + 0.9 * centre * audioKick + 1.1 * audioDrop
           + 0.25 * audioSwell;

    // Sector seams glow softly in the key colour.
    float seam = exp( -abs( ang - sector * 0.5 ) * 24.0 );
    col += hueRot( vec3( 0.35, 0.5, 0.7 ), audioChromaHue ) * seam * 0.30;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col * 1.30 ) * 0.55;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
