#version 330 core
/*****************************************************************************\
 *                              MelodyRidgeline.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MELODY RIDGELINE: the melody as mountains.
 *
 *  The 96-sample melody history is the profile of the nearest ridge (newest at the right), scrolling steadily
 *  leftward with the sample clock; behind it, older ridges -- the same history at larger delays, hazed by distance
 *  -- so the tune stands as a range of hills under a sky of the photo.  The swell is the daylight, the kick a flash
 *  on the nearest summit, the treble the snow glints.  Camera fixed.
 *
 *  Audio Reactivity:
 *    audioMelody[96] / audioMelodyHead -> the ridges (continuous history)
 *    audioSwell   -> daylight (slow)
 *    audioKick    -> summit flash (light)
 *    audioHigh    -> snow glints (light)
 *    audioLevel   -> brightness
 *
 *  Per-activation variety: ridgesP, heightP, hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;    ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;       ///< Seconds since this scene was activated.
uniform float audioAdvance;    ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                               ///< backwards).
uniform float audioMelody[96]; ///< The melody: the dominant pitch every ~80 ms, a ring of 96 (~7.7 s); 0 = no clear
                               ///< pitch.
uniform float audioMelodyHead; ///< Head of the audioMelody ring as a position 0..1 (the newest sample just behind it).
uniform float audioSwell;      ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;       ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;       ///< High band level, 0..1.
uniform float audioLevel;      ///< Overall loudness, 0..1.
uniform float audioChromaHue;  ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;    ///< Mood valence: 0 dark .. 1 bright.

uniform float ridgesP; ///< Ridges knob, 0..1.
uniform float heightP; ///< Height knob, 0..1.
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
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
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

/**  Melody value at a fractional age (samples ago), interpolated.
 *
 * @param ago  Samples ago (fractional). (in)
 *
 * @return
 *   The melody pitch, 0..1.
 **/
float melodyAt( float ago )
{
    float head = audioMelodyHead * 96.0;
    float f = head - ago;
    int   i0 = int( floor( f ) );
    float t = f - floor( f );
    int   a = ( ( i0 % 96 ) + 96 ) % 96;
    int   b = ( ( i0 + 1 ) % 96 + 96 ) % 96;
    float va = audioMelody[a], vb = audioMelody[b];
    // Treat silence (0) as the valley floor.
    return mix( va, vb, t );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    int   n_ridges = 3 + int( clamp( ridgesP, 0.0, 1.0 ) * 3.0 );
    float height = 0.35 + 0.3 * clamp( heightP, 0.0, 1.0 );
    float day = 0.4 + 0.7 * clamp( audioSwell, 0.0, 1.0 );
    float hi = clamp( audioHigh * 2.0, 0.0, 1.0 );

    // Sky: the photo soft, warm with the day.
    vec3 sky = ( interpolation * textureLod( tex0, gl_FragCoord.xy / resolution, 3.0 )
                 + ( 1.0 - interpolation ) * textureLod( tex1, gl_FragCoord.xy / resolution, 3.0 ) )
                   .rgb;
    sky = mix( sky, sky * imgPalette( hue * 0.159 + 0.6 ) * 1.5, 0.3 ) * day;
    sky += vec3( 1.0, 0.9, 0.7 ) * exp( -length( p - vec2( 0.4, 0.3 ) ) * 3.0 ) * 0.4 * day;
    vec3 col = sky;

    // Ridges from far to near: ridge j uses the history at an extra delay
    // and smaller amplitude; the x axis is age (right = now).
    for ( int j = 6; j >= 0; --j )
    {
        if ( j >= n_ridges )
            continue;
        float fj = float( j );
        float depth = fj / float( n_ridges );      // 0 near .. 1 far
        float x = ( p.x / aspect + 0.5 );          // 0 left .. 1 right
        float ago = ( 1.0 - x ) * 80.0 + fj * 2.0; // samples ago, offset per ridge
        // With no melody (silence, or a track the tracker cannot follow) a
        // gentle rolling profile on the clock keeps the range alive.
        float m_raw = melodyAt( ago );
        float roll = 0.3 + 0.2 * sin( ago * 0.25 + fj ) + 0.1 * sin( ago * 0.7 + sceneAdvance * 0.2 );
        float m = max( m_raw, roll * ( 1.0 - smoothstep( 0.02, 0.1, m_raw ) ) );
        float base = -0.45 + depth * 0.32;
        float ridge_y = base + m * height * ( 1.0 - depth * 0.55 ) + 0.02 * sin( x * 40.0 + fj );
        float below = step( p.y, ridge_y );
        // Slope shading from the profile's derivative.
        float m2_raw = melodyAt( ago - 1.5 );
        float roll2 = 0.3 + 0.2 * sin( ( ago - 1.5 ) * 0.25 + fj )
                      + 0.1 * sin( ( ago - 1.5 ) * 0.7 + sceneAdvance * 0.2 );
        float m2 = max( m2_raw, roll2 * ( 1.0 - smoothstep( 0.02, 0.1, m2_raw ) ) );
        float slope = ( m2 - m ) * height;
        float facing = 0.5 + 0.5 * clamp( slope * 8.0, -1.0, 1.0 );
        vec3  rock = img( vec2( fract( x * 2.0 + fj * 0.3 ), clamp( ( p.y - base ) * 1.5, 0.0, 1.0 ) ) );
        rock = mix( rock, rock * imgPalette( hue * 0.159 + 0.3 + fj * 0.08 ) * 1.5, 0.35 );
        rock *= ( 0.3 + 0.7 * facing ) * ( 1.0 - depth * 0.4 ) * day;
        // Snow on the summits: bright above a line, glinting on the treble.
        float snow = smoothstep( ridge_y - 0.06, ridge_y - 0.01, p.y ) * step( 0.55, m );
        vec2  gu = p * 90.0;
        vec2  gc = floor( gu );
        vec2  gf = fract( gu ) - 0.5;
        vec2  go = vec2( hash21( gc + 1.3 ), hash21( gc + 5.9 ) ) - 0.5;
        float glint = smoothstep( 0.2, 0.05, length( gf - go * 0.6 ) ) * step( 0.93, hash21( gc ) ) * hi;
        rock = mix( rock, vec3( 0.95, 0.97, 1.0 ) * day, snow * 0.8 );
        rock += vec3( 1.0 ) * glint * snow;
        // Haze with distance.
        rock = mix( rock, sky, depth * 0.55 );
        col = mix( col, rock, below );
        // The nearest summit flashes on the kick.
        if ( j == 0 )
            col += imgPalette( hue * 0.159 + 0.9 ) * smoothstep( 0.01, 0.0, abs( p.y - ridge_y ) ) * audioKick
                   * smoothstep( 0.5, 0.8, m );
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
