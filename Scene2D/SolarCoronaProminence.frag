#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SolarCoronaProminence.frag
 * @brief SOLAR CORONA PROMINENCE: Volumetric solar magnetic coronal loops arching
 * over a boiling photospheric convection surface with explosive magnetic
 * reconnection flares, EUV thermal glow, and plasma filament turbulence.
 *   audioAdvance -> drives photospheric granulation convection flow
 *   audioKick    -> triggers coronal mass ejections & explosive flare flashes
 *   audioBass    -> undulates magnetic coronal loop arch heights
 *   audioSwell   -> widens thermal plasma glow & ionization layers
 *
 * Per-activation variety:
 *   loopP    float coronal loop density & arch height      (0.5..2.2)
 *   granuleP float photospheric convection cell size        (0.5..2.0)
 *   flareP   float magnetic reconnection flare brightness  (0.5..2.2)
 *   hueP     float EUV/H-alpha chromatic temperature shift (0..6.28)
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
uniform float flareP;
uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  2D Noise helper
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 456.21 ) );
    p += dot( p, p + 45.32 );
    return fract( p.x * p.y );
}

/**  Distance to the nearest granule centre (Voronoi F1).
 *
 * @param uv  The point. (in)
 *
 * @return
 *   The distance.
 **/
float voronoiGranules( vec2 uv )
{
    vec2  g = floor( uv );
    vec2  f = fract( uv );
    float min_dist = 1.0;
    for ( int y = -1; y <= 1; ++y )
    {
        for ( int x = -1; x <= 1; ++x )
        {
            vec2 lattice = vec2( float( x ), float( y ) );
            vec2 offset = vec2( hash21( g + lattice ), hash21( g + lattice + 15.7 ) );
            vec2 d = lattice + offset - f;
            min_dist = min( min_dist, length( d ) );
        }
    }
    return min_dist;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float lp = ( loopP > 0.0 ) ? loopP : 1.0;
    float grn = ( granuleP > 0.0 ) ? granuleP : 1.0;
    float flr = ( flareP > 0.0 ) ? flareP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 + audioAdvance * 0.18;

    // Convective solar granules background
    vec2  gran_coord = uv * 9.0 * grn + vec2( sin( t * 0.5 ), cos( t * 0.4 ) ) * 0.5;
    float gran = voronoiGranules( gran_coord );
    float granule_luminance = smoothstep( 0.05, 0.45, gran ) * ( 1.0 + 0.3 * audioMid );

    // Magnetic coronal loop arcs (parabolic / catenary magnetic field lines)
    float loop_accum = 0.0;
    float loop_count = 6.0;
    for ( float i = 0.0; i < loop_count; ++i )
    {
        float x_offset = ( i - loop_count * 0.5 ) * 0.35;
        float arch_height = ( 0.45 + 0.25 * sin( i * 1.7 + t ) ) * lp + audioBass * 0.3;

        // Parabolic loop equation: y = arch_height - ((x - x_offset)^2 / width)
        float loop_width = 0.22 + 0.1 * i;
        float target_y = arch_height - pow( ( uv.x - x_offset ) / loop_width, 2.0 ) * 1.5;
        float dist_to_loop = abs( uv.y - target_y );

        // Twisted helical plasma braids inside loop
        float helix = sin( uv.x * 25.0 + t * 5.0 + i * 2.0 ) * 0.02;
        dist_to_loop = abs( uv.y - ( target_y + helix ) );

        float loop_glow = exp( -dist_to_loop * 35.0 ) * ( 0.8 + 0.4 * sin( uv.x * 12.0 - t * 4.0 ) );
        loop_accum += loop_glow;
    }

    // Magnetic reconnection apex flare on beat
    vec2  flare_center = vec2( sin( t * 1.2 ) * 0.2, 0.35 * lp );
    float flare_dist = length( uv - flare_center );
    float flare = exp( -flare_dist * 18.0 ) * ( audioKick * 3.5 * flr + audioSubBass * 1.2 );

    // Photo texture mapping warped by magnetic convection
    vec2 photo_uv = st + vec2( sin( uv.y * 8.0 + t ), cos( uv.x * 8.0 - t ) ) * 0.04 * ( 1.0 + audioKick * 0.8 );
    vec3 photo = img( fract( photo_uv ) );

    // EUV & H-alpha solar palette (deep crimson, solar gold, ionized violet-white)
    vec3 gran_color = palTint( mix( vec3( 0.9, 0.3, 0.05 ), vec3( 1.0, 0.85, 0.3 ), granule_luminance ),
                               0.10 * granule_luminance, 0.18 );
    vec3 loop_color = palTint( mix( vec3( 1.0, 0.2, 0.5 ), vec3( 1.0, 0.95, 0.7 ), loop_accum * 0.4 ), 0.50, 0.18 );

    vec3 col = mix( photo * 0.8, gran_color, 0.45 + 0.2 * audioLevel );
    col += loop_accum * loop_color * ( 1.0 + audioSwell * 0.8 );
    col += flare * vec3( 1.0, 0.98, 0.85 ) * 1.8;

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.3, 0.4, length( uv ) );
    col *= vig;

    fragColor = vec4( col, 1.0 );
}
