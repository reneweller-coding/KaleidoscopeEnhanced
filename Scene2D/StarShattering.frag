#version 330 core
/*****************************************************************************\
 *                              StarShattering.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  STAR SHATTERING: A massive star is being violently ripped apart by a rogue black hole.
 *
 *  Stellar material is violently siphoned off into an accretion disk, causing the star to shatter and explode with
 *  the audio.
 *
 *    audioAdvance -> speed of the material being sucked into the black hole
 *    audioKick    -> catastrophic explosions on the star's surface
 *    audioSwell   -> blinding brightness of the dying star
 *    audioChromaHue-> palette offset for the stellar plasma
 *
 *  Per-activation variety:
 *    gravityP float strength of the black hole's pull (0.5..1.5)
 *    shatterP float intensity of the star's surface destruction (0.5..2.0)
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

uniform float gravityP; ///< Gravity knob: strength of the black hole's pull (0.5..1.5).
uniform float shatterP; ///< Shatter knob: intensity of the star's surface destruction (0.5..2.0).
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    for ( int i = 0; i < 5; ++i )
    {
        f += a * noise( p );
        p *= 2.0;
        a *= 0.5;
    }
    return f;
}

/**  Gravitational lensing distortion
 *
 * @param uv      The coordinate. (in)
 * @param center  Centre of the mass. (in)
 * @param mass    Strength of the lens. (in)
 *
 * @return
 *   The distorted coordinate.
 **/
vec2 lens( vec2 uv, vec2 center, float mass )
{
    vec2  dir = uv - center;
    float d = length( dir );
    if ( d == 0.0 )
        return uv;
    // Deflection angle approx
    float deflection = mass / max( d, 0.01 );
    return uv - normalize( dir ) * deflection;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float gp = ( gravityP > 0.01 ? gravityP : 1.0 );
    float sp = ( shatterP > 0.01 ? shatterP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    vec3 col = vec3( 0.0 );
    vec3 star_color = imgPalette( 0.8 + audioCentroid * 0.1 );
    vec3 dark_plasma = vec3( 0.05, 0.0, 0.1 ); // Exposed darker core layers

    // Positions
    vec2 star_pos = vec2( -0.4, 0.0 );
    vec2 bh_pos = vec2( 0.5, 0.0 );

    // Apply gravitational lensing to the whole scene from the black hole
    float bh_mass = 0.05 * gp;
    vec2  lensed_uv = lens( uv, bh_pos, bh_mass );

    // 1. The Black Hole
    float d_bh = length( uv - bh_pos );
    float event_horizon = 0.1 * gp;

    // 2. The Star
    float d_star = length( lensed_uv - star_pos );

    // The star is being deformed towards the black hole (Roche lobe overflow)
    // We stretch the distance function towards the BH
    vec2 to_bh = normalize( bh_pos - star_pos );
    vec2 from_star = lensed_uv - star_pos;

    // Teardrop distortion
    float stretch = max( 0.0, dot( normalize( from_star ), to_bh ) );
    float star_distorted = d_star * ( 1.0 - stretch * 0.4 * gp );

    float star_rad = 0.5;

    if ( star_distorted < star_rad )
    {
        // We are on the star surface
        // Map 2D to fake 3D sphere
        float z = sqrt( max( 0.0, star_rad * star_rad - star_distorted * star_distorted ) );
        vec3  p3 = vec3( from_star, z );

        // Rotation
        p3.xy = mat2( cos( time * 0.1 ), -sin( time * 0.1 ), sin( time * 0.1 ), cos( time * 0.1 ) ) * p3.xy;

        // Star surface texture
        float surface = fbm( vec3( p3 * 5.0 + vec3( 0.0, time * 0.5 + audioAdvance, 0.0 ) ) );

        // The side facing the BH is shattering/exploding
        float shatter_zone = stretch; // 0 on back, 1 on front facing BH

        // vec3(p3*10.0, time*2.0) was a vec3 + a float = 4 components into a
        // 3-component constructor (GLSL error C1068). Animate along z instead.
        float shatter_noise = fbm( p3 * 10.0 + vec3( 0.0, 0.0, time * 2.0 ) );
        float crack = smoothstep( 0.6 - shatter_zone * 0.4 * sp, 1.0, shatter_noise );

        // Violent kick explosions tearing chunks out of the star
        float explosion = step( 0.9, hash11( floor( p3.x * 5.0 ) + floor( time * 4.00 ) ) ) * shatter_zone; // was 10 Hz

        vec3 surface_col = mix( star_color * ( 0.5 + surface * 0.5 ), dark_plasma, crack * 0.8 );
        surface_col += star_color * explosion * audioKick * 5.0 * sp;

        // Limb darkening
        float limb = smoothstep( star_rad, star_rad - 0.1, star_distorted );
        col += surface_col * limb * ( 1.0 + audioSwell * 0.5 );
    }

    // 3. The Accretion Stream (Siphoned material)
    // Stream of plasma from the tip of the star into the black hole

    // Distance from the line connecting star and BH
    // Using unlensed UV for the plasma stream looks better
    vec2 stream_dir = to_bh;
    vec2 perp_dir = vec2( -stream_dir.y, stream_dir.x );

    vec2  p_stream = uv - star_pos;
    float dist_along_stream = dot( p_stream, stream_dir );
    float dist_from_stream = abs( dot( p_stream, perp_dir ) );

    float stream_len = length( bh_pos - star_pos );

    if ( dist_along_stream > 0.0 && dist_along_stream < stream_len )
    {
        // The stream narrows as it gets closer to the BH, but is chaotic
        float normalized_dist = dist_along_stream / stream_len;

        float stream_wobble = fbm( vec3( normalized_dist * 10.0, time * 2.0, 0.0 ) ) * 0.1;
        float actual_dist_from_stream = abs( dist_from_stream - stream_wobble );

        float stream_width = 0.15 * ( 1.0 - normalized_dist ) * gp;

        if ( actual_dist_from_stream < stream_width )
        {
            // Rushing plasma
            float speed = time * 10.0 + audioAdvance * 20.0;
            float plasma_noise = fbm( vec3( dist_from_stream * 20.0, dist_along_stream * 10.0 + speed, time ) );

            // Brightness increases as it gets sucked in
            float heat = pow( normalized_dist, 2.0 );

            // Audio kicks create massive pulses traveling down the stream
            float pulse = step( 0.9, fract( dist_along_stream * 5.0 - speed * 0.5 ) );

            float core = smoothstep( stream_width, 0.0, actual_dist_from_stream ) * plasma_noise;

            vec3 stream_col = star_color * core * ( 1.0 + heat * 5.0 ) * gp;
            stream_col *= ( 1.0 + pulse * audioKick * 5.0 * sp );

            col += stream_col * ( 1.0 + audioSwell );
        }
    }

    // 4. Black Hole Accretion Disk & Event Horizon
    if ( d_bh < event_horizon )
    {
        col = vec3( 0.0 ); // Black hole core
    }
    else
    {
        // Accretion disk orbiting the BH
        float angle_bh = atan( uv.y - bh_pos.y, uv.x - bh_pos.x );
        float disk_speed = time * 5.0 + audioAdvance * 5.0;

        float disk_noise = fbm( vec3( angle_bh * 10.0 + disk_speed, d_bh * 20.0, time ) );

        // Disk falls off quickly
        float disk_mask = exp( -( d_bh - event_horizon ) * ( 30.0 / gp ) );

        col += star_color * disk_noise * disk_mask * 3.0 * ( 1.0 + audioSwell ) * gp;

        // Event horizon photon ring (bright thin edge)
        float photon_ring = exp( -abs( d_bh - event_horizon * 1.1 ) * 100.0 );
        col += star_color * photon_ring * 5.0 * gp;
    }

    // Background stars (lensed)
    if ( star_distorted >= star_rad && d_bh >= event_horizon )
    {
        float bg = hash11( dot( floor( lensed_uv * 200.0 ), vec2( 12.3, 45.6 ) ) );
        if ( bg > 0.99 )
            col += vec3( 1.0 ) * ( 0.1 + audioSwell * 0.1 );
    }

    // Glare from the dying star
    float star_glare = exp( -d_star * 2.0 );
    col += star_color * star_glare * 0.3 * ( 1.0 + audioSwell );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
