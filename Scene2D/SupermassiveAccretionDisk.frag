#version 330 core
/*****************************************************************************\
 *                              SupermassiveAccretionDisk.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SUPERMASSIVE ACCRETION DISK: Raymarched Kerr rotating black hole with extreme gravitational frame-dragging,
 *  Doppler-boosted photon sphere, relativistic polar plasma jets, and gravitational lensing warping background
 *  starfields & photos.
 *
 *    audioSubBass -> expands ergosphere & singularity gravitational lens ring
 *    audioKick    -> ignites explosive polar relativistic jet bursts
 *    audioHigh    -> sparks synchrotron radiation in accretion disk
 *    audioSwell   -> increases accretion disk thermal radiance & swirl
 *
 *  Per-activation variety:
 *    spinP    float black hole angular momentum spin factor (0.5..1.8)
 *    diskP    float accretion disk radius / density         (0.6..1.8)
 *    jetP     float relativistic polar jet intensity        (0.5..2.2)
 *    hueP     float Doppler spectrum color shift            (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;  ///< Sub-bass band level, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioMid;      ///< Mid band level, 0..1.
uniform float audioHigh;     ///< High band level, 0..1.
uniform float audioFlux;     ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float spinP;          ///< Spin knob, 0..1.
uniform float diskP;          ///< Disk knob: accretion disk radius / density, 0.6..1.8.
uniform float jetP;           ///< Jet knob: relativistic polar jet intensity, 0.5..2.2.
uniform float hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

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
    p = fract( p * vec2( 371.89, 493.12 ) );
    p += dot( p, p + 59.23 );
    return fract( p.x * p.y );
}

/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float spn = ( spinP > 0.0 ) ? spinP : 1.0;
    float dsk = ( diskP > 0.0 ) ? diskP : 1.0;
    float jt = ( jetP > 0.0 ) ? jetP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length( uv );
    float a = atan( uv.y, uv.x );

    float t = time * 0.3 * spn + audioAdvance * 0.15;

    // Kerr black hole parameters
    float rs = 0.22 * ( 1.0 + 0.3 * audioSubBass ); // Event horizon radius
    float r_ergo = rs * 1.6;                        // Ergosphere radius

    // Gravitational lensing curvature
    float deflection = rs / max( r - rs * 0.7, 0.015 );
    vec2  lens_uv = uv + ( uv / max( r, 0.01 ) ) * deflection * 0.12;

    // Camera tilt / view angle towards tilted accretion disk
    float tilt_angle = 0.35 + 0.1 * sin( t * 0.2 );
    vec2  disk_coord = vec2( lens_uv.x, lens_uv.y / cos( tilt_angle ) );
    float disk_r = length( disk_coord );
    float disk_a = atan( disk_coord.y, disk_coord.x );

    // Accretion disk keplerian spiral coordinates
    float disk_spin = ( 8.0 / ( disk_r + 0.4 ) ) * t;
    float spiral_a = disk_a - disk_spin;

    // Accretion disk temperature & gas density
    float inner_r = rs * 1.8;
    float outer_r = 1.4 * dsk;
    float disk_mask = smoothstep( inner_r, inner_r + 0.08, disk_r ) * smoothstep( outer_r, outer_r - 0.3, disk_r );

    float disk_gas = noise( vec2( spiral_a * 4.0, disk_r * 12.0 - t * 2.0 ) );
    float disk_gas2 = noise( vec2( spiral_a * 8.0 + t, disk_r * 24.0 ) );
    float gas_density = ( disk_gas * 0.6 + disk_gas2 * 0.4 ) * disk_mask;

    // Relativistic Doppler Beaming: Approaching side (left) is blue-shifted & much brighter
    float beaming = clamp( 1.0 - sin( disk_a ) * 0.75, 0.2, 2.5 );
    vec3  doppler_col = imgPalette( 0.30 * clamp( beaming * 0.5, 0.0, 1.0 ) ) * 1.5;
    doppler_col = mix( doppler_col, vec3( 1.0, 0.9, 0.4 ), pow( gas_density, 2.0 ) );

    vec3 accretion_col = doppler_col * gas_density * beaming * 2.5 * ( 0.8 + audioSwell * 0.6 );

    // Photon sphere bright glowing ring at 1.5 * rs
    float photon_ring_dist = abs( r - rs * 1.5 );
    float photon_ring = ( 0.003 / ( photon_ring_dist * photon_ring_dist + 0.0002 ) ) * ( 1.0 + audioKick * 2.0 );
    vec3  ring_col = vec3( 1.0, 0.9, 0.6 ) * photon_ring;

    // Relativistic polar plasma jets shooting perpendicular to disk
    float jet_dist_x = abs( uv.x ) / max( abs( uv.y ), 0.05 );
    float jet_glow = ( 0.008 * jt ) / ( jet_dist_x * jet_dist_x + 0.01 ) * exp( -abs( uv.y ) * 0.3 );
    jet_glow *= ( 0.5 + 0.5 * sin( uv.y * 30.0 - time * 15.0 ) );
    vec3 jet_col = vec3( 0.1, 0.7, 1.0 ) * jet_glow * ( 1.0 + audioKick * 3.0 );

    // Gravitationally warped photo background
    vec2 photo_uv = st + ( uv / max( r, 0.01 ) ) * deflection * 0.06 * ( 1.0 + audioBass );
    vec3 photo = img( clamp( photo_uv, 0.0, 1.0 ) );

    // Combine black hole visualizer
    vec3 col = photo * 0.35 + accretion_col + ring_col + jet_col;

    // Event horizon absolute darkness
    float horizon_mask = smoothstep( rs * 0.95, rs * 1.05, r );
    col *= horizon_mask;

    // High frequency synchrotron radiation sparks
    if ( audioHigh > 0.4 && disk_mask > 0.1 )
    {
        float spark = hash21( floor( disk_coord * 60.0 ) + vec2( floor( time * 4.00 ), 5.0 ) );
        if ( spark > 0.96 )
        {
            col += vec3( 1.5, 1.2, 0.9 ) * audioHigh * 2.0;
        }
    }

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    vec2  v_uv = st * ( 1.0 - st.yx );
    float vig = v_uv.x * v_uv.y * 15.0;
    col *= clamp( pow( vig, 0.25 ), 0.0, 1.0 );

    // Highlights x0.45 before the clamp (17.10.2026): 27 % of the frame was bright, colourless and flat -- values
    // above 1 clipped to one plateau, which the soft knee and the auto exposure turned into a flat grey.  The
    // auto exposure lifts the frame back; the highlights keep their gradation.
    const float HiK = 0.45;
    fragColor = vec4( col * HiK, 1.0 );
}
