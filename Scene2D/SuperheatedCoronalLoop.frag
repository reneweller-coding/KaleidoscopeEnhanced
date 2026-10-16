#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SuperheatedCoronalLoop.frag
 * @brief SUPERHEATED CORONAL LOOP: 100% viewport-filling volumetric view of
 * solar coronal magnetic loops anchored in boiling photospheric convection
 * granules. Explosive magnetic reconnection flares, high-temperature
 * plasma fountains, coronal rain, and solar photo granulation.
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float loopP;
uniform float granuleP;
uniform float speedP; ///< Speed knob, 0..1.
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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
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


/**  House tint: bend a colour toward the photo palette while keeping its luminance -- the identity look survives,
 * only the hue follows the photos.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
}

/**  Distance to the nearest granule centre (Voronoi F1).
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance.
 **/
float voronoiGranules( vec2 x )
{
    vec2  n = floor( x );
    vec2  f = fract( x );
    float m = 8.0;
    for ( int j = -1; j <= 1; ++j )
    {
        for ( int i = -1; i <= 1; ++i )
        {
            vec2  g = vec2( float( i ), float( j ) );
            vec2  o = vec2( hash21( n + g ), hash21( n + g + vec2( 17.1, 43.7 ) ) );
            vec2  r = g + o - f;
            float d = dot( r, r );
            m = min( m, d );
        }
    }
    return sqrt( m );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float lp = ( loopP > 0.0 ) ? loopP : 1.0;
    float grn = ( granuleP > 0.0 ) ? granuleP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Photospheric convection granulation
    vec2  granule_coord = uv * 10.0 * grn + vec2( sin( t * 0.2 ), cos( t * 0.15 ) ) * 0.5;
    float v_gran = voronoiGranules( granule_coord );
    float granule_center = smoothstep( 0.4, 0.0, v_gran ); // Hot bright centers
    float granule_lanes = smoothstep( 0.0, 0.25, v_gran ); // Cooler dark intergranular lanes

    // Coronal magnetic loops (arches spanning the canvas)
    float loop_arch1 = uv.y - ( 0.4 - pow( uv.x * 1.5, 2.0 ) ) + 0.1 * sin( uv.x * 12.0 + t * 2.0 );
    float loop_arch2 = uv.y - ( 0.6 - pow( ( uv.x - 0.3 ) * 1.8, 2.0 ) ) + 0.08 * cos( uv.x * 14.0 - t * 3.0 );
    float loop_arch3 = uv.y - ( 0.5 - pow( ( uv.x + 0.35 ) * 1.6, 2.0 ) ) + 0.09 * sin( uv.x * 10.0 + t );

    float loop1 = exp( -abs( loop_arch1 ) * 20.0 );
    float loop2 = exp( -abs( loop_arch2 ) * 25.0 );
    float loop3 = exp( -abs( loop_arch3 ) * 22.0 );
    float total_loops = ( loop1 + loop2 + loop3 ) * lp;

    // Relativistic magnetic reconnection snap on kicks
    float reconnect_snap = exp( -abs( uv.x ) * 15.0 ) * exp( -abs( uv.y - 0.4 ) * 15.0 );
    float flare_flash = reconnect_snap * ( audioKick * 3.0 + audioSubBass * 1.5 );

    // Plasma flow along magnetic loops
    float plasma_flow = sin( uv.x * 30.0 - time * 12.0 ) * 0.5 + 0.5;

    // Photo texture embedded into boiling solar granulation
    vec2 photo_uv = uv * 0.4 + vec2( 0.5 ) + vec2( cos( t * 0.1 ), sin( t * 0.15 ) ) * 0.05;
    vec3 photo_solar = img( fract( photo_uv ) );

    // Solar colors: 6000K Photosphere Gold, 2M Kelvin Coronal Cyan/Violet, Blinding Flare White
    vec3 photo_base = mix( vec3( 1.0, 0.45, 0.05 ), vec3( 1.0, 0.85, 0.25 ), granule_center ) * photo_solar;
    vec3 loop_plasma = palTint( mix( vec3( 1.0, 0.2, 0.05 ), vec3( 0.3, 0.8, 1.0 ), plasma_flow ), 0.30 * plasma_flow,
                                0.20 );
    vec3 flare_white = vec3( 1.0, 0.98, 0.92 ) * 3.0;

    vec3 col = photo_base * ( 0.8 + 0.5 * audioBass );
    col += loop_plasma * total_loops * ( 1.2 + 1.5 * audioHigh );
    col += flare_white * flare_flash;

    // Solar limb darkening & corona glow
    float corona_glow = exp( -length( uv ) * 2.0 ) * ( 0.4 + 0.6 * audioSwell );
    col += vec3( 1.0, 0.6, 0.1 ) * corona_glow;

    col = hueRot( col, hue ); // chromaHue handled inside imgPalette
    col = pow( col, vec3( 0.85 ) );

    fragColor = vec4( col, 1.0 );
}
