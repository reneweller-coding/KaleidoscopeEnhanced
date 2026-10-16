#version 330 core
/*****************************************************************************\
 *                              PlanetaryCollision.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PLANETARY COLLISION: The apocalyptic moment two massive planets collide.
 *
 *  Crusts shatter, oceans boil into space, and glowing magma is exposed in the catastrophic impact zone. Huge
 *  shockwaves of debris violently explode outward with every audio kick.
 *
 *    audioAdvance -> intense chaotic movement of the colliding crusts
 *    audioKick    -> massive explosive shockwaves and magma bursts
 *    audioSwell   -> blinding heat and brightness of the impact zone
 *    audioChromaHue-> palette offset for the molten rock and plasma
 *
 *  Per-activation variety:
 *    impactP float intensity of the shatter and debris (0.5..1.5)
 *    heatP float temperature/brightness of the collision (0.5..2.0)
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

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float impactP; ///< Impact knob: intensity of the shatter and debris (0.5..1.5).
uniform float heatP;   ///< Heat knob: temperature/brightness of the collision (0.5..2.0).
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Ridged noise for shattered crust
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value.
 **/
float ridged( vec3 p )
{
    float f = 0.0, a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        f += a * ( 1.0 - abs( noise( p ) * 2.0 - 1.0 ) );
        p *= 2.0;
        a *= 0.5;
    }
    return f;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float ip = ( impactP > 0.01 ? impactP : 1.0 );
    float hp = ( heatP > 0.01 ? heatP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    vec3 col = vec3( 0.0 );

    vec3 crust_color1 = vec3( 0.1, 0.12, 0.15 );                // Rocky/water planet
    vec3 crust_color2 = vec3( 0.15, 0.1, 0.05 );                // Rocky/desert planet
    vec3 magma_color = imgPalette( 0.8 + audioCentroid * 0.1 ); // Intense heat

    // Centers of the two planets
    // They are overlapping heavily to show the collision in progress
    vec2 p1_center = vec2( -0.3, -0.2 );
    vec2 p2_center = vec2( 0.3, 0.2 );

    float p1_rad = 0.7;
    float p2_rad = 0.6;

    float d1 = length( uv - p1_center );
    float d2 = length( uv - p2_center );

    // Impact zone is where they intersect
    float impact_zone = smoothstep( 0.4, 0.0, d1 ) * smoothstep( 0.4, 0.0, d2 );

    // Overall masking for the combined planetary mass
    float mass = max( smoothstep( p1_rad, p1_rad - 0.05, d1 ), smoothstep( p2_rad, p2_rad - 0.05, d2 ) );

    if ( mass > 0.0 )
    {
        // Base planet textures
        // We distort the coordinates in the impact zone
        vec2 distort_uv = uv + normalize( uv ) * impact_zone * ( fbm( vec3( uv * 10.0, time + audioAdvance ) ) * 0.5 );

        float tex1 = fbm( vec3( ( distort_uv - p1_center ) * 5.0, time * 0.1 ) );
        float tex2 = fbm( vec3( ( distort_uv - p2_center ) * 6.0, time * 0.1 + 10.0 ) );

        vec3 p_col = mix( crust_color1 * tex1, crust_color2 * tex2, smoothstep( -0.1, 0.1, uv.x ) );

        // Shattered crust - deep glowing cracks radiating from impact
        float crack_dist1 = length( distort_uv - ( p1_center + p2_center ) * 0.5 );

        // Huge jagged ridges
        float shatter = ridged( vec3( distort_uv * 8.0, time * 0.2 + audioAdvance ) );

        // The closer to the impact zone, the more shattered it is and the brighter the magma
        float damage = exp( -crack_dist1 * 4.0 ) * ip;
        float cracks = smoothstep( 0.7 - damage * 0.3, 1.0, shatter );

        // Magma bleeding through the shattered crust
        vec3 surface_col = mix( p_col, magma_color * ( 1.0 + hp * 2.0 ), cracks * damage );

        // The pure impact zone is a blinding mess of magma and plasma
        float pure_impact = exp( -crack_dist1 * 10.0 );
        float impact_noise = fbm( vec3( distort_uv * 20.0, time * 5.0 + audioAdvance * 5.0 ) );
        surface_col = mix( surface_col, magma_color * ( 2.0 + impact_noise * 2.0 ) * ( 1.0 + audioSwell * 2.0 ) * hp,
                           pure_impact );

        // Add violent flashes on kicks directly in the impact zone
        float explosion = step( 0.9, hash11( floor( time * 4.00 ) ) ); // was 10 Hz
        surface_col += magma_color * explosion * audioKick * 10.0 * hp * pure_impact;

        col += surface_col * mass;

        // Limb darkening on the outer edges, but brightening in the center
        float outer_limb = smoothstep( 1.0, 0.8, max( d1 / p1_rad, d2 / p2_rad ) );
        col *= outer_limb;
    }
    else
    {
        // Deep space
        // Round, jittered stars: brightening whole floor() cells gives SQUARES
        // (the repeatedly reported "giant pixel" fault).
        vec2  sgrid = uv * 60.0;
        vec2  sid = floor( sgrid );
        vec2  sfr = fract( sgrid ) - 0.5;
        float sh = fract( sin( dot( sid, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        if ( sh > 0.90 )
        {
            vec2  spos = ( vec2( fract( sh * 7.31 ), fract( sh * 13.7 ) ) - 0.5 ) * 0.8;
            float sd2 = dot( sfr - spos, sfr - spos );
            float stw = 0.7 + 0.3 * sin( time * ( 1.0 + 2.0 * fract( sh * 29.0 ) ) + sh * 40.0 );
            col += vec3( 1.0 ) * exp( -sd2 * 250.0 ) * stw * ( 0.35 + audioSwell * 0.25 );
        }
    }

    // Ejecta / Debris / Shockwaves exploding outward
    // Radial shockwaves blasting from the center
    vec2  impact_center = ( p1_center + p2_center ) * 0.5;
    vec2  dir = uv - impact_center;
    float dist = length( dir );

    if ( dist > 0.1 )
    {
        // A shockwave expanding outward with audio kicks
        // We use fract of time to make continuous rings, multiplied by kick
        float shock_speed = time * 3.0 + audioAdvance * 5.0;
        float shock_ring = step( 0.95, fract( dist * 5.0 - shock_speed ) );

        // Break up the shockwave into fiery debris
        float debris_noise = fbm( vec3( normalize( dir ) * 10.0, shock_speed ) );
        float debris = smoothstep( 0.6, 0.8, debris_noise );

        // Shockwave is extremely bright when an audio kick happens
        float shock_int = shock_ring * debris * ( audioKick * 5.0 + audioSwell ) * hp * ip;
        shock_int *= exp( -dist * 2.0 ); // fades as it gets further

        col += magma_color * shock_int;

        // Continuous fine glowing dust being blown away
        float dust = fbm( vec3( dir * 5.0, time * 2.0 + audioAdvance * 3.0 ) );
        float dust_mask = smoothstep( 0.0, 0.5, dist ) * exp( -dist * 3.0 );
        col += magma_color * dust * dust_mask * 0.5 * ( 1.0 + audioSwell ) * hp;
    }

    // Massive glare over the whole scene from the intense heat
    float glare = exp( -length( uv - impact_center ) * 2.0 );
    col += magma_color * glare * ( 0.2 + audioSwell * 0.5 ) * hp;

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
