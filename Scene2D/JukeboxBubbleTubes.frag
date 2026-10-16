#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file JukeboxBubbleTubes.frag
 * @brief JUKEBOX BUBBLE TUBES: the front of a period jukebox.  Bubble
 * tubes arch over the case, each a glass column of coloured liquid with
 * round bubbles rising through it on the scene clock; behind them the
 * record carousel turns steadily, the selection board carries the photo
 * as its title strips, and the neon trim glows.  The chroma classes drive
 * the tube colours, the swell the neon, the kick a flicker in one tube.
 * Camera fixed on the cabinet.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> the tube colours (light)
 *   sceneAdvance    -> bubbles rise, the carousel turns (continuous)
 *   audioSwell      -> the neon trim (slow)
 *   audioKick       -> one tube flickers (light)
 *   audioHigh       -> the chrome sparkle (light)
 *
 * Per-activation variety: tubesP, bubbleP, hueP.
 */
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;    ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;       ///< Seconds since this scene was activated.
uniform float audioAdvance;    ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                               ///< backwards).
uniform float audioChroma[12]; ///< Pitch-class energies (12 values).
uniform float audioSwell;      ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;       ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;       ///< High band level, 0..1.
uniform float audioLevel;      ///< Overall loudness, 0..1.
uniform float audioChromaHue;  ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;    ///< Mood valence: 0 dark .. 1 bright.

uniform float tubesP;  ///< Tubes knob, 0..1.
uniform float bubbleP; ///< Bubble knob, 0..1.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float tubes = 4.0 + floor( clamp( tubesP, 0.0, 1.0 ) * 4.0 );
    float bubbles = 0.5 + 0.9 * clamp( bubbleP, 0.0, 1.0 );
    float neon = 0.6 + 0.6 * clamp( audioSwell, 0.0, 1.0 );
    float hi = clamp( audioHigh * 2.0, 0.0, 1.0 );
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;

    // The room, dark; the cabinet fills most of the frame.
    vec3 col = img( uv ) * mix( vec3( 0.14, 0.13, 0.14 ), imgPalette( hue * 0.159 + 0.6 ) * 0.25, 0.5 ) * 0.8;

    // The cabinet: a wooden case with a domed top.
    float dome_y = 0.2;
    float case_half = aspect * 0.36;
    float dome = step( length( vec2( p.x / case_half, max( p.y - dome_y, 0.0 ) / 0.24 ) ), 1.0 );
    float body = step( abs( p.x ), case_half ) * step( -0.46, p.y ) * step( p.y, dome_y );
    float cabinet = max( dome, body );
    if ( cabinet > 0.5 )
    {
        vec3 wood = img( clamp( vec2( uv.x * 0.7 + 0.15, uv.y * 0.5 ), 0.0, 1.0 ) )
                    * mix( vec3( 0.42, 0.25, 0.12 ), imgPalette( hue * 0.159 + 0.08 ), 0.25 );
        wood *= 0.7 + 0.4 * hash21( floor( vec2( p.x * 400.0, p.y * 30.0 ) ) );
        col = mix( col, wood * ( 0.9 + 0.7 * neon ) + 0.04, cabinet );
    }
    // The lit display window: the selection board with the photo as its
    // title strips, and the carousel behind it.
    vec2  win_c = vec2( 0.0, 0.05 );
    float win = step( abs( p.x - win_c.x ), case_half * 0.62 ) * step( abs( p.y - win_c.y ), 0.16 );
    if ( win > 0.5 )
    {
        vec2 wq = ( p - win_c ) / vec2( case_half * 0.62, 0.16 );
        // The carousel: a turntable of records seen edge-on, turning.
        float ca = atan( wq.y * 0.6, wq.x ) + clock * 0.5;
        float cr = length( wq * vec2( 1.0, 1.7 ) );
        vec3  inside = vec3( 0.06, 0.05, 0.07 );
        float disc = smoothstep( 0.9, 0.85, cr ) * smoothstep( 0.25, 0.3, cr );
        vec3  vinyl = vec3( 0.1, 0.1, 0.11 ) * ( 0.6 + 0.5 * sin( cr * 90.0 ) );
        vinyl += mix( vec3( 1.0, 0.8, 0.4 ), imgPalette( hue * 0.159 + 0.15 ), 0.35 )
                 * pow( max( cos( ca * 6.0 ), 0.0 ), 12.0 ) * 0.5;
        inside = mix( inside, vinyl, disc );
        // Title strips across the window.
        float strip = step( 0.06, fract( wq.y * 6.0 ) ) * step( fract( wq.y * 6.0 ), 0.9 );
        vec3  title = img( clamp( vec2( fract( wq.x * 0.5 + 0.25 ), fract( wq.y * 3.0 ) ), 0.0, 1.0 ) ) * 1.4;
        inside = mix( inside, mix( vec3( 0.9, 0.88, 0.8 ), title, 0.45 ),
                      strip * smoothstep( 0.75, 0.55, abs( wq.y ) ) * 0.85 );
        col = mix( col, inside * ( 0.6 + 0.7 * neon ), win );
        // The glass over it.
        col += vec3( 1.0 ) * smoothstep( 0.5, 0.0, abs( wq.x * 0.7 + wq.y - 0.4 ) ) * 0.06 * neon;
    }
    // The bubble tubes: they arch up the sides and over the dome.
    for ( int i = 0; i < 8; ++i )
    {
        float fi = float( i );
        if ( fi >= tubes )
            break;
        int   cls = int( mod( fi * 3.0 + 1.0, 12.0 ) );
        float e = clamp( audioChroma[cls] * 1.6, 0.0, 1.0 );
        vec3  tc = imgPalette( hue * 0.159 + float( cls ) / 12.0 ) * 1.5 + 0.2;
        // The tube's path: up one side, over the dome, down the other.
        float side = ( mod( fi, 2.0 ) < 0.5 ) ? -1.0 : 1.0;
        float lane = floor( fi * 0.5 );
        float x0 = side * ( case_half - 0.035 - lane * 0.045 );
        // The vertical part.
        float d_v = abs( p.x - x0 );
        float on_v = step( -0.44, p.y ) * step( p.y, dome_y );
        // The arched part over the dome.
        float rr = case_half - 0.035 - lane * 0.045;
        float d_a = abs( length( vec2( p.x / max( rr, 1e-3 ),
                                       max( p.y - dome_y, 0.0 ) / max( 0.24 * rr / case_half, 1e-3 ) ) )
                         - 1.0 )
                    * rr;
        float on_a = step( dome_y, p.y );
        float d = mix( d_v, d_a, on_a );
        float tube_r = 0.018;
        float in_tube = smoothstep( tube_r, tube_r * 0.75, d ) * max( on_v, on_a );
        if ( in_tube > 0.002 )
        {
            // The liquid: the class colour, brighter in the middle of the bore.
            float bore = 1.0 - clamp( d / tube_r, 0.0, 1.0 );
            vec3  liquid = tc * ( 0.4 + 0.8 * sqrt( bore ) ) * ( 0.55 + 0.7 * e );
            // Bubbles: round, rising along the tube on their own phases.
            float along = mix( ( p.y + 0.44 ) / 0.64, 1.0 + atan( p.y - dome_y, abs( p.x ) ) * 0.3, on_a );
            for ( int k = 0; k < 7; ++k )
            {
                float fk = float( k );
                float ph = fract( clock * ( 0.25 + 0.18 * hash11( fi * 3.1 + fk ) ) + hash11( fi * 5.7 + fk * 2.3 ) );
                float bz = ph * 1.4;
                float bd = length( vec2( d, ( along - bz ) * 0.5 ) );
                float br = 0.008 + 0.006 * hash11( fi + fk * 7.7 );
                float bub = smoothstep( br, br * 0.4, bd ) * step( 1.0 - 0.85 * bubbles, hash11( fi * 11.0 + fk ) );
                liquid += vec3( 1.0 ) * bub * ( 0.5 + 0.8 * hi );
                liquid *= 1.0 - 0.25 * smoothstep( br * 1.6, br, bd );
            }
            // A flicker in one tube on the kick.
            float pick = step( 0.8, hash11( fi + floor( clock * 0.9 ) ) );
            liquid += tc * pick * audioKick * 0.8;
            col = mix( col, liquid, in_tube );
            // The glow the tube throws on the cabinet.
            col += tc * exp( -d * 26.0 ) * ( 0.15 + 0.5 * e ) * max( on_v, on_a ) * 0.7;
        }
    }
    // Chrome trim along the case edges.
    float trim = smoothstep( 0.01, 0.004, abs( abs( p.x ) - case_half ) ) * step( -0.46, p.y ) * step( p.y, dome_y );
    col = mix( col, vec3( 0.75, 0.76, 0.8 ) * ( 0.5 + 0.6 * neon ), trim );
    col += vec3( 1.0 ) * trim * hi * 0.35;
    // The speaker grille below the window.
    float grille = step( abs( p.x ), case_half * 0.55 ) * step( -0.36, p.y ) * step( p.y, -0.16 );
    float slots = smoothstep( 0.006, 0.002, abs( fract( p.y * 40.0 ) - 0.5 ) - 0.35 );
    col = mix( col, vec3( 0.14, 0.12, 0.1 ) * ( 0.6 + 0.5 * neon ), grille * slots );
    col *= 0.9 + 0.2 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
