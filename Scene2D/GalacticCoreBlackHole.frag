#version 330 core
/*****************************************************************************\
 *                              GalacticCoreBlackHole.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  GALACTIC CORE BLACK HOLE: A fast-paced orbit around Sagittarius A* at the center of the galaxy.
 *
 *  Extreme density of fast-moving stars zooming past, heavily distorted by the immense gravitational lensing of the
 *  black hole.
 *
 *    audioAdvance -> camera orbital speed
 *    audioKick    -> flashes from stars being torn apart / accretion flares
 *    audioSwell   -> brightness of the dense galactic core background
 *    audioChromaHue-> palette offset for the core's light
 *
 *  Per-activation variety:
 *    starP float density and speed of orbiting stars (0.5..2.0)
 *    lensP float strength of the gravitational lensing (0.5..1.5)
 *    hueP float palette offset (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float starP; ///< Star knob: density and speed of orbiting stars (0.5..2.0).
uniform float lensP; ///< Lens knob, 0..1.
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
/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
/**  Pseudo-random number 0..1 from a 3D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash31( vec3 p )
{
    return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float sp = ( starP > 0.01 ? starP : 1.0 );
    float lp = ( lensP > 0.01 ? lensP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Position of the supermassive black hole
    vec2 bh_pos = vec2( 0.0, 0.0 );

    // Camera orbital motion (background rotates)
    float cam_rot = time * 0.2 + audioAdvance * 0.5;
    mat2  rot_m = mat2( cos( cam_rot ), -sin( cam_rot ), sin( cam_rot ), cos( cam_rot ) );

    vec2  st = uv - bh_pos;
    float dist = length( st );

    // Gravitational Lensing effect
    // Event horizon size
    float rs = 0.15;

    // Lensing distortion
    float deflection = rs * rs / ( dist * dist );
    deflection *= lp; // adjust lensing strength

    vec2 lensed_st = st * ( 1.0 - deflection );
    // Rotate lensed coordinates to simulate orbiting
    lensed_st = rot_m * lensed_st;

    vec3 col = vec3( 0.0 );

    vec3 core_color = imgPalette( 0.8 + audioCentroid * 0.2 ); // Golden/white core
    vec3 accretion_color = imgPalette( 0.3 );                  // Orange/reddisk

    if ( dist > rs * 0.95 )
    { // Outside event horizon

        // 1. Dense background stars of the galactic core
        float bg_stars = 0.0;
        for ( int i = 0; i < 3; ++i )
        {
            float sc = 20.0 + 30.0 * float( i );
            vec2  p = lensed_st * sc;
            vec2  cell = floor( p );
            vec2  f = fract( p ) - 0.5;

            float h = hash21( cell + float( i ) * 11.0 );
            if ( h > 0.6 )
            {
                float star_dist = length( f );
                float intensity = exp( -star_dist * ( 50.0 + h * 50.0 ) );

                // Twinkle
                intensity *= 0.6 + 0.4 * sin( time * ( 2.0 + h * 4.0 ) );

                bg_stars += intensity * ( 1.0 + audioSwell * 0.5 );
            }
        }
        col += core_color * bg_stars;

        // 2. Fast moving foreground stars in tight orbits
        // We simulate this by transforming coordinates into polar and moving them rapidly
        vec2 polar = vec2( length( lensed_st ), atan( lensed_st.y, lensed_st.x ) );

        for ( int j = 0; j < 15; ++j )
        {
            float seed = float( j );
            float orbit_radius = 0.2 + hash11( seed ) * 1.5;
            // Slowed down a lot: up to 35 rad/s whipped the stars around the hole as
            // "very fast circles".
            float speed = ( 0.5 + hash11( seed + 1.0 ) * 1.2 ) / orbit_radius;

            // Retrograde or prograde
            speed *= ( hash11( seed + 2.0 ) > 0.5 ) ? 1.0 : -1.0;

            float angle = polar.y + time * speed * sp + audioAdvance * speed * 0.5;

            // Wrap angle
            float a_diff = mod( angle, 6.28318 ) - 3.14159;
            float r_diff = polar.x - orbit_radius;

            // Map back to cartesian distance for drawing
            float d2_star = length( vec2( r_diff, a_diff * polar.x ) );

            if ( d2_star < 0.1 )
            {
                float s_int = 0.001 / max( d2_star * d2_star, 0.0001 );
                // Flares / tidal disruption near the black hole
                if ( orbit_radius < 0.4 && hash11( floor( time * 1.2 ) + seed ) > 0.8 )
                {
                    s_int *= 2.0 + audioKick * 5.0; // bright flash
                }

                vec3 s_color = imgPalette( hash11( seed + 3.0 ) );
                col += s_color * s_int * sp;
            }
        }

        // 3. Faint accretion disk glow
        float disk = exp( -( dist - rs * 1.5 ) * ( dist - rs * 1.5 ) * 50.0 );
        col += accretion_color * disk * ( 0.2 + audioSwell * 0.5 );

        // 4. Photon ring (extremely bright thin ring just outside event horizon)
        float photon_ring = smoothstep( rs * 1.05, rs, dist ) * smoothstep( rs * 0.9, rs * 0.98, dist );
        col += core_color * photon_ring * ( 2.0 + audioKick );
    }
    else
    {
        // Inside event horizon (pure black)
        col = vec3( 0.0 );
    }

    // Core glow (general ambient brightness of being in the center of the galaxy)
    float core_glow = exp( -dist * 2.0 );
    col += core_color * core_glow * 0.2 * ( 1.0 + audioSwell );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
