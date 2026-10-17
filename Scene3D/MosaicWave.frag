#version 330 core
/*****************************************************************************\
 *                              MosaicWave.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades one tile of a mosaic wall built from photo tiles that flip between front (the image) and back (a
 *  hue-inverted twin), with thin dark grout lines keeping the mosaic pattern readable.
 *
 *  vFlip (front/back sign from the vertex stage) selects which face is
 *  shown, hue-rotating the back face by audioChromaHue; vLight (also
 *  baked upstream) shades edge-on tiles darker as they flip; audioDrop
 *  adds a final brightness pulse across the whole wall.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// MosaicWave.frag — front = the image; back = hue-inverted twin.  Thin dark
// grout lines keep the mosaic readable.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioDrop;      ///< Drop envelope: high after a detected drop, decaying.

in vec2  vUV;    ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vFlip;  ///< Flip (from the vertex stage).
in float vLight; ///< Light (from the vertex stage).

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
    vec3 col = img( vUV );

    // While a tile shows its back, show the key-rotated twin image.
    if ( vFlip < 0.0 )
        col = hueRot( col.bgr, audioChromaHue * 2.0 + 2.6 );

    // Grout between tiles.
    vec2  cell_uv = fract( vUV * vec2( 100.0, 30.0 ) );
    vec2  b = min( cell_uv, 1.0 - cell_uv );
    float grout = smoothstep( 0.0, 0.05, min( b.x, b.y ) );

    // Edge-on tiles darken naturally with the flip angle.
    col *= ( 0.25 + 0.75 * abs( vFlip ) ) * vLight * grout;
    col *= 1.0 + 0.9 * audioDrop;

    fragColor = vec4( col * 1.2, 1.0 );
}
