#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MagnetarCrustquakeSGR.frag
 * @brief MAGNETAR CRUSTQUAKE SGR: Ultra-magnetic neutron star ($10^{15}$ Gauss)
 * displaying tectonic crust fractures (starquakes). Torsional Alfvén waves
 * twist the magnetosphere, triggering giant Soft Gamma Repeater (SGR) flares,
 * positron pair-plasma fountains, and relativistic synchrotron photo mapping.
 *   audioAdvance -> rotates magnetosphere dipolar magnetic field lines
 *   audioKick    -> triggers catastrophic starquake crust fractures & gamma flashes
 *   audioBass    -> undulates torsional Alfvén wave shear amplitude
 *   audioCentroid-> shifts synchrotron radiation emission frequency
 *
 * Per-activation variety:
 *   crustP  float crust fracture density & fault lines    (0.5..2.2)
 *   burstP  float gamma-ray burst & flare radiance        (0.5..2.0)
 *   speedP  float magnetar rotation velocity              (0.5..2.0)
 *   hueP    float synchrotron chromatic hue offset        (0..6.28)
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

uniform float crustP; ///< Crust knob: crust fracture density & fault lines, 0.5..2.2.
uniform float burstP; ///< Burst knob: gamma-ray burst & flare radiance, 0.5..2.
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

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

// ---- Voronoi crust fracture generator ----
/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 434.34, 735.21 ) );
    p += dot( p, p + 52.32 );
    return fract( p.x * p.y );
}

/**  Distance to the nearest crust plate centre (Voronoi F1).
 *
 * @param p  The point. (in)
 *
 * @return
 *   The distance.
 **/
float voronoiCrust( vec2 p )
{
    vec2  g = floor( p );
    vec2  f = fract( p );
    float min_dist = 1.0;
    for ( int y = -1; y <= 1; ++y )
    {
        for ( int x = -1; x <= 1; ++x )
        {
            vec2 lattice = vec2( float( x ), float( y ) );
            vec2 offset = vec2( hash21( g + lattice ), hash21( g + lattice + 33.7 ) );
            vec2 d = lattice + offset - f;
            min_dist = min( min_dist, length( d ) );
        }
    }
    return min_dist;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float crs = ( crustP > 0.0 ) ? crustP : 1.0;
    float brs = ( burstP > 0.0 ) ? burstP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    float r = length( uv );
    float angle = atan( uv.y, uv.x );

    // Neutron star surface sphere: r < 0.45
    float star_radius = 0.42 + 0.05 * sin( t * 0.8 );
    float is_star = smoothstep( star_radius + 0.02, star_radius - 0.02, r );

    // Crust voronoi fractures (fault lines)
    vec2  crust_coord = uv * 10.0 * crs + vec2( t * 0.5, 0.0 );
    float fracture = voronoiCrust( crust_coord );
    float fault_lines = exp( -fracture * 18.0 ) * is_star;

    // Starquake fault rupture glow on kick
    float quake_glow = fault_lines * ( audioKick * 4.0 * brs + audioHigh * 2.0 );

    // Dipolar magnetosphere field lines in exterior: r > star_radius
    float dipole_angle = angle + sin( r * 8.0 - t * 4.0 ) * 0.6 * ( 1.0 + audioBass );
    float dipole_field = abs( sin( dipole_angle * 6.0 ) );
    float alfven_waves = sin( r * 30.0 - t * 10.0 ) * exp( -r * 2.0 );
    float magnetosphere = dipole_field * exp( -abs( r - star_radius ) * 4.0 ) * ( 1.0 + alfven_waves * 0.5 );

    // Soft Gamma Repeater (SGR) polar flare burst
    vec2  north_pole = vec2( 0.0, star_radius * 0.9 );
    float pole_dist = length( uv - north_pole );
    float sgr_flare = exp( -pole_dist * 8.0 ) * ( audioKick * 3.5 * brs + audioSubBass * 1.5 );

    // Photo texture mapping into crust plates and magnetic sheets
    vec2 photo_uv = st + vec2( sin( dipole_angle ), cos( dipole_angle ) ) * 0.04 * ( 1.0 + audioKick * 0.6 );
    vec3 photo = img( fract( photo_uv ) );

    // Magnetar color palette (neutron iron crust, gamma violet-cyan, plasma white)
    vec3 crust_color = palTint( mix( vec3( 0.08, 0.06, 0.1 ), vec3( 0.2, 0.15, 0.3 ), is_star ), 0.50, 0.20 );
    vec3 flare_color = vec3( 0.2, 0.9, 1.0 );
    vec3 gamma_white = vec3( 1.0, 0.98, 0.95 );

    // Combine visualizer
    vec3 col = mix( crust_color, photo * 0.8, 0.4 + 0.2 * audioLevel );
    col += magnetosphere * flare_color * ( 1.0 + audioSwell * 0.8 );
    col += quake_glow * vec3( 1.0, 0.85, 0.3 ) * 2.0;
    col += sgr_flare * gamma_white * 2.5;

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.35, 0.35, r );
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.7;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
