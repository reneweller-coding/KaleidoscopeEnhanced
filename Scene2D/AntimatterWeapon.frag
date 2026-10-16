#version 330 core
/*****************************************************************************\
 *                              AntimatterWeapon.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  ANTIMATTER WEAPON: A doomsday superweapon firing a continuous beam of pure antimatter into a target.
 *
 *  The annihilation zone flashes violently with pure energy on audio kicks, sending ripples of destruction through
 *  space.
 *
 *    audioAdvance -> flow of the antimatter particles in the beam
 *    audioKick    -> blinding annihilation flashes at the impact site
 *    audioSwell   -> ambient brightness of the destruction
 *    audioChromaHue-> palette offset for the exotic antimatter energy
 *
 *  Per-activation variety:
 *    beamP float width and instability of the weapon beam (0.5..1.5)
 *    blastP float intensity of the impact annihilation (0.5..2.0)
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

uniform float beamP;  ///< Beam knob: width and instability of the weapon beam (0.5..1.5).
uniform float blastP; ///< Blast knob: intensity of the impact annihilation (0.5..2.0).
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float bp = ( beamP > 0.01 ? beamP : 1.0 );
    float blast = ( blastP > 0.01 ? blastP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    vec3 col = vec3( 0.0 );

    // Antimatter is exotic, maybe deep purple/magenta turning to blinding white
    vec3 am_color = imgPalette( 0.7 + audioCentroid * 0.2 );
    vec3 target_color = vec3( 0.1, 0.15, 0.1 ); // Dark target (maybe a planet or moon)

    // 1. The Target (being annihilated)
    // Placed on the right side of the screen
    vec2  target_pos = vec2( 0.5, 0.0 );
    float d_target = length( uv - target_pos );
    float target_rad = 0.4;

    if ( d_target < target_rad )
    {
        // Target surface
        float surface = fbm( vec3( uv * 10.0, 0.0 ) );
        col = target_color * ( 0.5 + surface * 0.5 );

        // Annihilation spread / cracks propagating from the impact site
        float impact_dist = length( uv - vec2( 0.1, 0.0 ) ); // The impact hits the left edge of the target
        float destruction = fbm( vec3( uv * 20.0, time * 0.5 ) );

        // The destruction eats away the target
        float eat_away = smoothstep( 0.4, 0.0, impact_dist ) * destruction;
        if ( eat_away > 0.3 )
        {
            // It turns into pure energy
            col = mix( col, am_color * 2.0 * ( 1.0 + audioSwell ), smoothstep( 0.3, 0.8, eat_away ) );
        }

        // Limb darkening
        col *= smoothstep( target_rad, target_rad - 0.1, d_target );
    }

    // 2. The Antimatter Beam
    // Fired from off-screen left, hitting the target at x=0.1
    // The beam is a chaotic, crackling stream of exotic particles

    // Only draw the beam to the left of the impact site
    if ( uv.x < 0.2 )
    {
        // Distance from the central axis of the beam
        float beam_axis_y = sin( uv.x * 5.0 - time * 5.0 ) * 0.02 * bp; // Slight wobble
        float d_beam = abs( uv.y - beam_axis_y );

        // The beam narrows at the impact site
        float beam_width = 0.05 * bp * ( 1.0 - smoothstep( -0.5, 0.1, uv.x ) );

        // Fractal noise moving extremely fast along the beam
        float stream = fbm( vec3( uv.x * 20.0 - ( time * 10.0 + audioAdvance * 20.0 ), uv.y * 50.0, time ) );

        // Containment fields / magnetic rings holding the antimatter
        float rings = step( 0.9, sin( uv.x * 50.0 + time * 5.0 ) );

        // Core of the beam is pure white/bright
        float core = smoothstep( beam_width, 0.0, d_beam ) * stream;

        // Outer aura
        float aura = exp( -d_beam * ( 40.0 / bp ) );

        // Intensity spikes on audio kick
        float kick_intensity = 1.0 + audioKick * 5.0;

        vec3 beam_render = am_color * core * 3.0 * kick_intensity;
        beam_render += am_color * aura * ( 0.5 + stream * 0.5 ) * ( 1.0 + audioSwell );

        // Add magnetic containment rings
        beam_render += am_color * rings * aura * 2.0;

        col += beam_render;
    }

    // 3. The Annihilation Impact Zone
    // Where matter and antimatter meet at x=0.1, y=0.0
    vec2  impact_pos = vec2( 0.1, 0.0 );
    float d_impact = length( uv - impact_pos );

    // Massive spherical blast wave radiating from impact
    float blast_wave = step( 0.95, fract( d_impact * 10.0 - ( time * 5.0 + audioAdvance * 5.0 ) ) );
    float blast_mask = exp( -d_impact * 5.0 );

    // Violent flashes on audio kicks
    float explosion = step( 0.8, hash11( floor( time * 4.00 ) ) ) * audioKick * 10.0 * blast; // was 15 Hz

    // Core of the impact is completely blown out white
    float impact_core = exp( -d_impact * 20.0 ) * ( 2.0 + explosion );

    col += am_color * blast_wave * blast_mask * ( 1.0 + audioKick * 2.0 ) * blast;
    col += am_color * impact_core * blast;

    // Background space (stars getting distorted by gravity/energy)
    if ( d_target >= target_rad )
    {
        float bg_distort = d_impact;
        vec2  bg_uv = uv + normalize( uv - impact_pos ) * ( 0.01 / max( bg_distort, 0.01 ) );
        float bg = hash11( dot( floor( bg_uv * 100.0 ), vec2( 12.3, 45.6 ) ) );
        if ( bg > 0.99 )
        {
            col += vec3( 1.0 ) * ( 0.2 + audioSwell * 0.2 );
        }
    }

    // Overall glare
    col += am_color * exp( -d_impact * 3.0 ) * 0.3 * ( 1.0 + audioSwell ) * blast;

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
