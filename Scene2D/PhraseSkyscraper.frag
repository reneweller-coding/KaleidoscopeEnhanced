#version 330 core
/*****************************************************************************\
 *                              PhraseSkyscraper.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PHRASE SKYSCRAPER: the music builds a city.
 *
 *  The current phrase is a tower going up floor by floor with the phrase position -- the floors are the photo, lit
 *  windows are the spectrum bands -- and the phrases already finished stand as a skyline behind it (one tower per
 *  finished phrase, counted from the section count), so a song ends as a city.  The drop lights every window at
 *  once; the kick flashes the crane beacon; night sky, round stars.  Camera fixed.
 *
 *  Audio Reactivity:
 *    audioPhrasePos   -> the tower's height (continuous)
 *    audioSectionCount -> how many towers stand (grows through the song)
 *    audioSpectrum[32] -> lit windows (light)
 *    audioDrop        -> all windows light (the drop)
 *    audioKick        -> crane beacon (light)
 *    audioLevel       -> brightness
 *
 *  Per-activation variety: widthP, floorsP, hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;      ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;         ///< Seconds since this scene was activated.
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioPhrasePos;    ///< Position within the current 8-bar phrase, 0..1.
uniform float audioSectionCount; ///< Number of section changes so far (counts up at every detected change).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioDrop;         ///< Drop envelope: high after a detected drop, decaying.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.

uniform float widthP;  ///< Width knob, 0..1.
uniform float floorsP; ///< Floors knob, 0..1.
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

/**  A tower: returns coverage and colour for a tower of given centre x, half-width, top y, floor height; windows lit
 * by band and glow.
 *
 * @param p       The point. (in)
 * @param cx      Centre x of the tower. (in)
 * @param hw      Half width. (in)
 * @param top     Top y. (in)
 * @param floorH  Height of a floor. (in)
 * @param glow    Glow of the lit windows. (in)
 * @param lit     Share of lit windows. (in)
 * @param seed    Seed of the windows. (in)
 * @param ground  Ground y. (in)
 * @param cover   Receives the tower's coverage, 0 or 1. (out)
 *
 * @return
 *   The tower's colour (RGB).
 **/
vec3 tower( vec2 p, float cx, float hw, float top, float floorH, float glow, float lit, float seed, float ground,
            out float cover )
{
    float in_x = step( abs( p.x - cx ), hw );
    float in_y = step( ground, p.y ) * step( p.y, top );
    cover = in_x * in_y;
    float fl = floor( ( p.y - ground ) / floorH );
    float wx = fract( ( p.x - cx + hw ) / ( hw * 2.0 ) * 6.0 );
    float wy = fract( ( p.y - ground ) / floorH );
    float window = smoothstep( 0.3, 0.2, abs( wx - 0.5 ) ) * smoothstep( 0.35, 0.25, abs( wy - 0.5 ) );
    int   band = int( mod( fl * 3.0 + seed * 7.0 + floor( wx * 0.0 ), 32.0 ) );
    float e = clamp( audioSpectrum[band] * 1.6, 0.0, 1.0 );
    float on = max( step( 0.55, hash21( vec2( fl, floor( ( p.x - cx + hw ) / ( hw * 2.0 ) * 6.0 ) + seed ) ) )
                        * ( 0.3 + 0.7 * e ),
                    lit );
    vec3  facade = img( vec2( fract( ( p.x - cx ) * 2.0 + seed ), fract( ( p.y - ground ) * 1.5 ) ) ) * 0.25
                   + vec3( 0.03, 0.03, 0.05 );
    vec3  win_col = mix( vec3( 1.0, 0.85, 0.55 ), imgPalette( seed * 0.3 + float( band ) / 32.0 ), 0.4 ) * 1.5;
    return mix( facade, win_col * on, window * ( 0.4 + 0.6 * glow ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float hw = 0.08 + 0.06 * clamp( widthP, 0.0, 1.0 );
    float floorH = 0.032 - 0.01 * clamp( floorsP, 0.0, 1.0 );
    float pos = clamp( audioPhrasePos, 0.0, 1.0 );
    float drop = clamp( audioDrop, 0.0, 1.0 );
    float ground = -0.42;
    float max_top = 0.42;
    int   done = int( clamp( audioSectionCount, 0.0, 14.0 ) );

    // Night sky with round stars, the photo faint as city glow at the horizon.
    vec3 col = mix( vec3( 0.01, 0.012, 0.03 ), vec3( 0.06, 0.04, 0.08 ), p.y + 0.5 );
    vec2 su = p * 90.0;
    vec2 sc = floor( su );
    vec2 sf = fract( su ) - 0.5;
    vec2 so = vec2( hash21( sc + 1.3 ), hash21( sc + 5.9 ) ) - 0.5;
    col += vec3( 0.7 ) * smoothstep( 0.14, 0.03, length( sf - so * 0.6 ) ) * step( 0.985, hash21( sc ) )
           * step( ground, p.y );
    col += imgPalette( hue * 0.159 + 0.1 ) * exp( -( p.y - ground ) * 4.0 ) * 0.15 * step( ground, p.y );
    // Finished towers: one per counted section, placed by hash, behind.
    for ( int i = 0; i < 14; ++i )
    {
        if ( i >= done )
            break;
        float fi = float( i );
        float cx = ( hash11( fi * 3.7 ) - 0.5 ) * aspect * 0.95;
        float h = 0.25 + 0.55 * hash11( fi * 5.3 );
        float cov;
        vec3  tc = tower( p, cx, hw * ( 0.7 + 0.5 * hash11( fi * 7.1 ) ), ground + h, floorH, 0.6, drop, fi + 1.0,
                          ground, cov );
        tc *= 0.75; // behind: a little dimmer
        col = mix( col, tc, cov );
    }
    // The current tower: rising with the phrase, centre-right, in front.
    float cur_top = ground + 0.05 + ( max_top - ground - 0.05 ) * pos;
    float cov;
    vec3  tc = tower( p, 0.15, hw, cur_top, floorH, 1.0, drop, 0.0, ground, cov );
    col = mix( col, tc, cov );
    // The crane on top: a mast and a jib, a beacon flashing on the kick.
    float mast_x = 0.15 + hw * 0.6;
    float mast = step( abs( p.x - mast_x ), 0.006 ) * step( cur_top, p.y ) * step( p.y, cur_top + 0.14 );
    float jib = step( abs( p.y - ( cur_top + 0.13 ) ), 0.005 ) * step( mast_x - 0.16, p.x )
                * step( p.x, mast_x + 0.06 );
    col = mix( col, vec3( 0.6, 0.45, 0.2 ), max( mast, jib ) );
    col += vec3( 1.0, 0.2, 0.15 ) * exp( -length( p - vec2( mast_x, cur_top + 0.145 ) ) * 60.0 )
           * ( 0.4 + 2.0 * audioKick );
    // The floor under construction: a bright edge at the top of the tower.
    col += imgPalette( hue * 0.159 + 0.9 ) * smoothstep( 0.008, 0.0, abs( p.y - cur_top ) )
           * step( abs( p.x - 0.15 ), hw ) * 0.8;
    // Street level: a glowing ground line.
    col = mix( col, vec3( 0.08, 0.07, 0.1 ), step( p.y, ground ) );
    col += imgPalette( hue * 0.159 + 0.1 ) * smoothstep( 0.01, 0.0, abs( p.y - ground ) ) * 0.5;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
