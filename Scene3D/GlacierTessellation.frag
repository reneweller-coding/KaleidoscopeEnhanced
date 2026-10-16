#version 400 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file GlacierTessellation.frag
 * @brief GLACIER TESSELLATION: low flight over tessellated glacier ice - white/blue
 * subsurface-scattering ice with crevasse light from INSIDE, tinted by the
 * photo palette; the terrain streams beneath the camera.
 *   audioAdvance -> flight speed      audioKick -> crevasse flash
 *   audioBass    -> ice-wave heave
 */

in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in vec3  vWorld;    ///< World position (from the vertex stage).
in vec2  vUV;       ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vCrevasse; ///< Crevasse (from the vertex stage).

uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;           ///< Seconds since the program started (never reset; see sceneTime).
uniform float     hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                  ///< backwards).
uniform float audioValence;       ///< Mood valence: 0 dark .. 1 bright.

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

/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image; the arc follows
 * the musical key (audioChromaHue is circular-slewed = jump-free), valence shapes saturation.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3  n = normalize( vNormal );
    vec3  light_dir = normalize( vec3( 0.6, 0.8, -0.5 ) );
    float diff = max( dot( n, light_dir ), 0.0 );

    // Specular frost
    vec3  view_dir = normalize( -vWorld );
    vec3  refl = reflect( -light_dir, n );
    float spec = pow( max( dot( view_dir, refl ), 0.0 ), 32.0 );

    // Subsurface scattering ice blue
    vec3 ice_core = vec3( 0.05, 0.6, 0.95 );
    vec3 ice_surface = vec3( 0.85, 0.95, 1.0 );
    vec3 ice_col = mix( ice_core, ice_surface, diff * 0.7 + 0.3 );

    // Glowing crevasses: light from inside the ice, tinted by the PHOTO
    // palette (house standard) instead of a fixed neon cyan.
    // 65% of a 1.6x photo-arc colour flooded the whole glacier with the
    // photo's dominant hue (recorded as ORANGE ice).  The photo may only
    // inflect the crevasse teal, never replace it.
    vec3 crevasse_col = mix( vec3( 0.0, 1.0, 0.9 ), imgPalette( 0.18 ), 0.22 )
                        * vCrevasse * 1.6;

    // Sample active photo texture
    vec3 photo = img( vUV );

    vec3 col = ice_col + spec * vec3( 1.0, 1.0, 1.0 ) * 0.8 + crevasse_col;
    col /= 1.0 + 0.45 * max( col.r, max( col.g, col.b ) ); // additive stack knee
    col += photo * 0.25;
    col /= 1.0 + 0.25 * max( col.r, max( col.g, col.b ) );

    // Fog into distance
    float dist = length( vWorld );
    float fog = 1.0 - exp( -dist * 0.008 );
    vec3  fog_col = vec3( 0.02, 0.08, 0.15 );
    col = mix( col, fog_col, fog );

    float h = ( hueP > 0.0 ) ? hueP : 0.0;
    if ( h > 0.001 )
        col = hueRot( col, 0.25 * sin( h ) ); // full rotation turned the ice ORANGE

    fragColor = vec4( col, 1.0 );
}
