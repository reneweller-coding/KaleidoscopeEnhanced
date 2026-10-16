#version 330 core
/*****************************************************************************\
 *                              NeutronStarCollision.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  NEUTRON STAR COLLISION: Two incredibly dense neutron stars spiraling towards each other.
 *
 *  They emit blinding, high-frequency jets of gamma radiation that pulse violently to the beat.
 *
 *    audioAdvance -> rotation speed of the binary system
 *    audioKick    -> intense energy bursts and jet pulses
 *    audioSwell   -> overall brightness of the accretion disc and jets
 *    audioChromaHue-> palette offset for the extreme radiation
 *
 *  Per-activation variety:
 *    distP float distance between the stars (0.5..1.5)
 *    jetP float intensity of the radiation jets (0.5..2.0)
 *    hueP float palette offset (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
// Both count from THIS activation instead of from the program start:
// `time` and `audioAdvance` grow without bound and so serve only as a
// phase, never as a position or a noise coordinate.
uniform float sceneTime;    ///< Seconds since this scene was activated.
uniform float sceneAdvance; ///< The music's advance since this scene was activated (integrated, never jumps).

uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float distP; ///< Dist knob: distance between the stars (0.5..1.5).
uniform float jetP;  ///< Jet knob: intensity of the radiation jets (0.5..2.0).
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Pseudo-random number 0..1 from a float.
 *
 * @param n  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float n )
{
    return fract( sin( n * 127.1 ) * 43758.5453 );
}
/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise( vec3 p )
{
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix( mix( hash11( n + 0.0 ), hash11( n + 1.0 ), f.x ),
             mix( hash11( n + 57.0 ), hash11( n + 58.0 ), f.x ), f.y ),
        mix( mix( hash11( n + 113.0 ), hash11( n + 114.0 ), f.x ),
             mix( hash11( n + 170.0 ), hash11( n + 171.0 ), f.x ), f.y ),
        f.z );
}

/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec3 p )
{
    float f = 0.0, a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        f += a * noise( p );
        p *= 2.0;
        a *= 0.5;
    }
    return f;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dp = ( distP > 0.01 ? distP : 1.0 );
    float jp = ( jetP > 0.01 ? jetP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Orbital mechanics
    // DER DRITTE AKT: Inspiral -> Merger-Blitz -> Schockwelle, zyklisch.
    // Vorher kreisten die Sterne nur ewig ("extrem langweilig").
    float cyc = fract( time / 45.0 );
    float insp = smoothstep( 0.0, 0.82, cyc );    // 0..1 until the merger
    float post_m = smoothstep( 0.82, 0.86, cyc ); // 1 after the merger
    float orbit_speed = sceneTime * 2.0 + sceneTime * insp * insp * 5.0
                        + sceneAdvance * 4.0;
    float orbit_rad = 0.42 * dp * ( 1.0 - 0.92 * insp ); // the spiral tightens

    vec2 p1 = vec2( cos( orbit_speed ), sin( orbit_speed ) ) * orbit_rad;
    vec2 p2 = vec2( cos( orbit_speed + 3.14159 ), sin( orbit_speed + 3.14159 ) ) * orbit_rad;

    // Distances
    float d1 = length( uv - p1 );
    float d2 = length( uv - p2 );

    // Gravitational lensing (approximate pixel distortion)
    float mass = 0.02 * ( 1.0 + audioSwell * 0.5 );
    vec2  lens_uv = uv;
    lens_uv -= ( uv - p1 ) * mass / max( d1 * d1, 0.01 );
    lens_uv -= ( uv - p2 ) * mass / max( d2 * d2, 0.01 );

    vec3 col = vec3( 0.0 );

    vec3 star_col1 = imgPalette( 0.8 + audioCentroid * 0.1 ); // Extremely hot/bright
    vec3 star_col2 = imgPalette( 0.9 + audioKick * 0.1 );
    vec3 jet_col = imgPalette( 0.4 );

    // Core of the stars (very small but infinitely bright)
    float star_vis = 1.0 - post_m; // merged after the merger
    col += star_col1 * star_vis * 0.005 / max( d1 - 0.01, 0.001 );
    col += star_col2 * star_vis * 0.005 / max( d2 - 0.01, 0.001 );

    // MERGER: greller Blitz, dann expandierende Schockschale + Remnant.
    float flash = exp( -abs( cyc - 0.82 ) * 60.0 );
    col += vec3( 1.0, 0.97, 0.9 ) * flash * 5.0;
    float ring_t = clamp( ( cyc - 0.82 ) / 0.18, 0.0, 1.0 );
    if ( ring_t > 0.0 )
    {
        float shock_r = ring_t * 1.7;
        col += mix( star_col1, star_col2, 0.5 )
               * exp( -abs( length( uv ) - shock_r ) * 16.0 ) * ( 1.0 - ring_t ) * 2.5;
        // Remnant-Magnetar im Zentrum
        col += star_col2 * post_m * ( 1.0 - ring_t * 0.6 ) * 0.004 / max( length( uv ) - 0.005, 0.001 );
    }

    // Plasma sharing/accretion between them
    float shared_d = length( uv - ( p1 + p2 ) * 0.5 ) - orbit_rad;
    float plasma_bridge = fbm( vec3( uv * 10.0, sceneTime * 5.0 ) ) * 0.05 / max( abs( shared_d ), 0.01 );
    col += mix( star_col1, star_col2, 0.5 ) * plasma_bridge * ( 1.0 + audioSwell );

    // Jets emitting from poles (we approximate poles facing outward/inward)
    vec2 jet_dir1 = normalize( p1 );
    vec2 jet_dir2 = normalize( p2 );

    // Adding 3D rotation feel to jets
    float jet_rot = time * 2.0;
    mat2  rot1 = mat2( cos( jet_rot ), -sin( jet_rot ), sin( jet_rot ), cos( jet_rot ) );

    float j1 = max( 0.0, dot( normalize( uv - p1 ), rot1 * jet_dir1 ) );
    float j2 = max( 0.0, dot( normalize( uv - p2 ), rot1 * jet_dir2 ) );

    j1 = pow( j1, 100.0 ) * ( 0.01 / d1 );
    j2 = pow( j2, 100.0 ) * ( 0.01 / d2 );

    // Pulses traveling along jets
    float j_pulse1 = step( 0.8, sin( length( uv - p1 ) * 20.0 - time * 20.0 ) );
    float j_pulse2 = step( 0.8, sin( length( uv - p2 ) * 20.0 - time * 20.0 ) );

    col += jet_col * j1 * jp * ( 1.0 + j_pulse1 * audioKick * 5.0 );
    col += jet_col * j2 * jp * ( 1.0 + j_pulse2 * audioKick * 5.0 );

    // Magnetic field lines (fbm noise stretched along rotation)
    vec2  polar = vec2( length( uv ), atan( uv.y, uv.x ) );
    float mag_field = fbm( vec3( polar.x * 2.0, polar.y * 10.0 - orbit_speed, sceneTime ) );
    col += jet_col * mag_field * 0.1 * ( 1.0 + audioSwell ) / ( polar.x + 0.1 );

    // Deep space background (distorted)
    vec3  bg_col = vec3( 0.0 );
    float bg_noise = fbm( vec3( lens_uv * 50.0, 0.0 ) );
    if ( bg_noise > 0.8 )
        bg_col = imgPalette( bg_noise ) * pow( bg_noise, 10.0 );

    col += bg_col * ( 0.2 + audioSwell * 0.2 );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure (extreme for collision scene)
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.5 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
