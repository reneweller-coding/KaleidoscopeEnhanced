#version 330 core
/*****************************************************************************\
 *                              PhotoShatter.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades one flying shard of the shattered current photo (tex0): the plain image, lit by vLight, with hot
 *  fracture-line edges.
 *
 *  audioDrop is what ignites the fracture edges — they stay faint between
 *  drops and blaze orange on one — and audioChromaHue hue-rotates that
 *  edge colour so it tracks the music's key.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// PhotoShatter.frag — plain image shards with a hot edge while flying.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioDrop;      ///< Drop envelope: high after a detected drop, decaying.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

in vec2  vUV;    ///< Texture coordinate 0..1 over the screen (from the vertex stage).
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
    vec3 col = img( vUV ) * vLight;

    // Hot fracture edges, strongest during the blast.
    vec2  cell_uv = fract( vUV * vec2( 75.0, 40.0 ) );
    vec2  b = min( cell_uv, 1.0 - cell_uv );
    float edge = 1.0 - smoothstep( 0.0, 0.10, min( b.x, b.y ) );
    col += hueRot( vec3( 1.0, 0.55, 0.20 ), audioChromaHue )
           * edge * ( 0.15 + 1.6 * audioDrop );

    fragColor = vec4( col * 1.15, 1.0 );
}
