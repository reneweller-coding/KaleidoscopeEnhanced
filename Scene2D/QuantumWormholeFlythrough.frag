#version 330 core
/*****************************************************************************\
 *                              QuantumWormholeFlythrough.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  QUANTUM WORMHOLE FLYTHROUGH: Relativistic Kerr wormhole transit raytracing.
 *
 *  Gravitational lensing around the photon ring throat, seamless universe transit, Doppler blue/redshift optical
 *  distortions, and cosmic void shockwaves.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives relativistic forward plunge through the wormhole throat
 *    audioKick    -> flashes throat event singularity & gravitational wave chirp
 *    audioCentroid-> modulates photon ring diffraction ring density
 *    audioSubBass -> expands throat diameter breathing
 *    audioChromaHue-> shifts universe 1 vs universe 2 chromatic palette
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

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

// Per-activation variety
uniform float speedP;        ///< Speed knob, 0..1.
uniform float throatRadiusP; ///< Throat radius knob, 0.7..1.4.
uniform float spinP;         ///< Spin knob, 0..1.
uniform float glowP;         ///< Glow / afterglow knob, 0..1.
uniform float hueP;          ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float r_throat = ( throatRadiusP > 0.01 ) ? throatRadiusP : 0.8;
    float a_spin = ( spinP > 0.01 ) ? spinP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.35 * spd + audioAdvance * 0.28 * spd; // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Relativistic camera flight along wormhole Z-axis
    // zThroat goes continuously from -infinity to +infinity (repeating universe cycles)
    float z_flight = t * 1.8;
    float cycle_z = mod( z_flight, 8.0 ) - 4.0; // Distance to throat center at z = 0
    bool  universe2 = ( mod( floor( z_flight / 8.0 ), 2.0 ) == 1.0 );

    vec3 ro = vec3( 0.0, 0.0, cycle_z );
    vec3 rd = normalize( vec3( uv, 1.3 + 0.2 * sin( audioSwell * 2.0 ) ) );

    // Ray deflection in Ellis/Kerr wormhole metric: ds^2 = -dt^2 + dl^2 + (r0^2 + l^2)(dtheta^2 + sin^2 theta dphi^2)
    vec3  p = ro;
    float tot_dist = 0.0;
    float min_throat_dist = 1e4;
    float ring_glow = 0.0;

    for ( int i = 0; i < 48; ++i )
    {
        float l = p.z; // Coordinate along throat
        float r_sq = dot( p.xy, p.xy );
        float r = sqrt( r_sq );

        // Effective wormhole radial throat radius
        float r_throat_eff = r_throat * ( 1.0 + 0.15 * sin( audioSwell * 2.5 ) + 0.1 * audioSubBass );
        float r_l = sqrt( r_throat_eff * r_throat_eff + l * l );

        // Gravitational lensing curvature acceleration
        vec2 d2r = -p.xy * ( 1.2 / pow( r_sq + 0.1, 1.5 ) ) * ( r_throat_eff / max( 0.5, r_l ) );
        rd.xy += d2r * 0.08;
        rd = normalize( rd );

        // Kerr frame dragging spin
        float spin_angle = a_spin * ( 0.04 / ( r_sq + 0.2 ) ) * ( 1.0 + audioFlux );
        float cs_s = cos( spin_angle ), sn_s = sin( spin_angle );
        rd.xy = mat2( cs_s, -sn_s, sn_s, cs_s ) * rd.xy;

        float step_size = max( 0.03, min( r, abs( l ) ) * 0.4 );
        p += rd * step_size;
        tot_dist += step_size;

        min_throat_dist = min( min_throat_dist, abs( length( p.xy ) - r_throat_eff ) + abs( l ) );
        ring_glow += exp( -min_throat_dist * 8.0 ) * ( 0.02 + 0.03 * audioLevel );

        if ( tot_dist > 10.0 )
            break;
    }

    // Determine exit universe: l > 0 vs l < 0
    bool in_other_universe = ( p.z > 0.0 );
    if ( universe2 )
        in_other_universe = !in_other_universe;

    // Map asymptotic ray angles to celestial sphere texture
    vec2 celestial_uv = vec2(
        atan( rd.y, rd.x ) / 6.2831853 + 0.5,
        acos( clamp( rd.z, -1.0, 1.0 ) ) / 3.14159265 );

    // Swirl texture mapping at exit
    celestial_uv += vec2( t * 0.05, 0.0 );
    vec3 star_sample = img( fract( celestial_uv ) );

    // Colors of Universe 1 (cool blues/cyans) vs Universe 2 (warm fiery magentas/golds)
    vec3 pal_u1 = imgPalette( rd.z * 0.5 + 0.2 );
    vec3 pal_u2 = imgPalette( rd.z * 0.5 + 0.7 );

    vec3 exit_col = in_other_universe ? mix( star_sample, pal_u2, 0.5 ) : mix( star_sample, pal_u1, 0.5 );

    // Photon ring throat laser glow
    float throat_laser = exp( -min_throat_dist * ( 24.0 + 12.0 * audioCentroid ) ) * glw;
    vec3  laser_tint = vec3( 1.4, 1.2, 1.8 ) * ( throat_laser + ring_glow * 0.5 ) * ( 1.0 + 2.5 * audioKick );

    vec3 final_col = exit_col + laser_tint;

    // Relativistic Doppler redshift/blueshift chromatic ring
    float doppler = 0.02 * ( audioFlux + audioKick );
    final_col.r *= ( 1.0 + doppler * 8.0 );
    final_col.b *= ( 1.0 - doppler * 4.0 );

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
