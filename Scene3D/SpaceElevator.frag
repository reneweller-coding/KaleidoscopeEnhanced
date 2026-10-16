#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SpaceElevator.frag
 * @brief SPACE ELEVATOR: A colossal tether extending into orbit.
 * Glowing cars race up and down the structure, while massive support rings
 * pulse with energy synchronized to the music.
 *   audioAdvance -> climbing speed up the tether
 *   audioKick    -> flashes from the elevator cars and warning beacons
 *   audioSwell   -> ambient daylight and atmospheric scattering
 *   audioChromaHue-> palette offset for the lights
 *
 * Per-activation variety:
 *   tetherP float complexity of the tether structure (0.7..1.5)
 *   glowP float intensity of the lights (0.6..1.8)
 *   hueP float palette offset (0..6.28)
 */

uniform float time;           ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioLevel;     ///< Overall loudness, 0..1.

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float tetherP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec4 vCol; ///< Colour (from the vertex stage).
in vec3 vCorner;
in vec3 vPos;    ///< Position (from the vertex stage).
in vec3 vNormal; ///< Surface normal (from the vertex stage).

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float tp = ( tetherP > 0.01 ? tetherP : 1.0 );
    float gp = ( glowP > 0.01 ? glowP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec3  n = normalize( vNormal );
    float type = vCol.w;
    // 0.0-0.5: Tether
    // 0.5-0.8: Rings
    // 0.8-1.0: Cars

    // Sunlight (strong directional light)
    vec3  sun_dir = normalize( vec3( 0.8, 0.5, 0.5 ) );
    float dif = max( dot( n, sun_dir ), 0.0 );
    float fill = 0.5 + 0.5 * dot( n, vec3( -0.8, -0.5, -0.5 ) );

    vec3 albedo = vec3( 0.7, 0.75, 0.8 ); // White/grey advanced materials

    // Grid pattern
    vec2 uv = vec2( 0.0 );
    if ( abs( n.x ) > 0.5 )
        uv = vPos.yz;
    else if ( abs( n.y ) > 0.5 )
        uv = vPos.xz;
    else
        uv = vPos.xy;

    vec2 grid = floor( uv * 0.5 * tp );
    albedo *= 0.7 + 0.3 * hash21( grid );

    vec3 col = albedo * ( 0.1 + dif * ( 1.0 + audioSwell * 0.5 ) );
    col += albedo * fill * 0.2;

    vec3 light_col = imgPalette( 0.8 + 0.1 * audioKick );
    vec3 warn_col = vec3( 1.0, 0.2, 0.1 );

    if ( type < 0.5 )
    {
        // Tether structure
        float window = step( 0.9, hash21( grid + vec2( 10.0 ) ) );
        float is_wall = step( 0.5, 1.0 - abs( n.y ) );
        col += light_col * window * is_wall * ( 0.5 + audioLevel ) * gp;

        // Strobes
        if ( mod( vCol.y * 100.0, 20.0 ) < 1.0 )
        {
            float blink = step( 0.95, fract( time * 2.0 + vCol.x * 10.0 ) );
            col += warn_col * blink * ( 2.0 + audioKick * 3.0 ) * gp;
        }
    }
    else if ( type < 0.8 )
    {
        // Support Rings
        float glow_edge = step( 0.9, hash21( grid * 0.1 ) );
        col += light_col * glow_edge * ( 1.0 + audioKick * 2.0 ) * gp;
    }
    else
    {
        // Elevator Cars
        // Intense glow
        float car_glow = step( 0.5, hash21( grid ) );
        vec3  car_col = imgPalette( vCol.x );
        col += car_col * car_glow * ( 1.5 + audioKick * 2.0 ) * gp * 2.0;

        // Engine trails pointing down
        if ( n.y < -0.5 )
        {
            col += car_col * ( 2.0 + audioSwell * 3.0 ) * gp * 3.0;
        }
    }

    // Atmospheric scattering (fading into the blue/black sky)
    float dist = length( vPos );
    float atm = exp( -dist * 0.005 );

    vec3 sky_col = mix( vec3( 0.01, 0.02, 0.05 ), vec3( 0.3, 0.5, 0.8 ), ( 0.2 + 0.8 * audioSwell ) );

    col = mix( sky_col, col, clamp( atm, 0.0, 1.0 ) );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
