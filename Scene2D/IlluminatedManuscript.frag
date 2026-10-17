#version 330 core
/*****************************************************************************\
 *                              IlluminatedManuscript.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  ILLUMINATED MANUSCRIPT: a vellum page with a gilded initial and a border of vines.
 *
 *  The vines grow along the margins over the scene arc (each tendril extends smoothly, its leaves opening as it
 *  passes), the gold leaf catches the light as it turns on the swell (a slow sweep of a highlight across the
 *  gilding), the miniature in the initial is the photo, the text lines are ruled script; the kick is the flash of
 *  the gold, the treble the sparkle of the burnished dots.  Camera fixed over the page.
 *
 *  Audio Reactivity:
 *    sceneProgress -> vine growth (the arc)
 *    audioSwell    -> the gold's highlight sweep (slow)
 *    audioKick     -> gold flash (light)
 *    audioHigh     -> burnish sparkle (light)
 *    audioLevel    -> brightness
 *
 *  Per-activation variety: vineP, goldP, hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float sceneProgress;  ///< Progress through this scene's solo time, 0..1.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float vineP; ///< Vine knob, 0..1.
uniform float goldP; ///< Gold knob, 0..1.
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

/**  A vine: a sinuous path along an edge, drawn as segments with leaves.
 *
 * @param p      The point. (in)
 * @param start  Start of the vine. (in)
 * @param dir    Direction along the edge. (in)
 * @param len    Length. (in)
 * @param grow   How far it has grown, 0..1. (in)
 * @param seed   Seed of the vine. (in)
 * @param leaf   Receives the leaf coverage. (out)
 *
 * @return
 *   The distance to the vine.
 **/
float vine( vec2 p, vec2 start, vec2 dir, float len, float grow, float seed, out float leaf )
{
    float best = 1e9;
    leaf = 0.0;
    vec2 side = vec2( -dir.y, dir.x );
    vec2 prev = start;
    for ( int s = 1; s <= 30; ++s )
    {
        float t = float( s ) / 30.0;
        if ( t > grow )
            break;
        vec2  q = start + dir * t * len + side * 0.06 * sin( t * 12.0 + seed );
        vec2  d = q - prev;
        float u = clamp( dot( p - prev, d ) / max( dot( d, d ), 1e-6 ), 0.0, 1.0 );
        best = min( best, length( p - ( prev + d * u ) ) );
        // A leaf every fifth segment, opening as the vine passes.
        if ( s % 5 == 0 )
        {
            float open = smoothstep( t, t + 0.05, grow );
            vec2  lp = q + side * 0.05 * open * ( ( s / 5 ) % 2 == 0 ? 1.0 : -1.0 );
            leaf = max( leaf,
                        smoothstep( 0.03 * open + 0.002, 0.015 * open, length( ( p - lp ) * vec2( 1.0, 1.6 ) ) ) );
        }
        prev = q;
    }
    return best;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float vine_len = 0.7 + 0.3 * clamp( vineP, 0.0, 1.0 );
    float gold_amt = 0.6 + 0.4 * clamp( goldP, 0.0, 1.0 );
    float prog = clamp( sceneProgress, 0.0, 1.0 );
    float sweep = 0.5 + 0.5 * sin( sceneAdvance * 0.3 + sceneTime * 0.05 + 2.0 * clamp( audioSwell, 0.0, 1.0 ) );
    float hi = clamp( audioHigh * 2.0, 0.0, 1.0 );

    // Vellum: warm cream with the photo as a faint mottle and fibre.
    vec3 vellum = vec3( 0.92, 0.86, 0.7 ) * ( 0.9 + 0.1 * dot( img( gl_FragCoord.xy / resolution ), vec3( 0.333 ) ) );
    vellum *= 0.96 + 0.04 * hash21( floor( p * 300.0 ) );
    vec3 col = vellum;
    // Ruled lines and script: rows of dark marks (a stand-in for the text).
    float row_f = ( p.y + 0.35 ) * 14.0;
    float row = floor( row_f );
    float in_text = step( -0.42, p.y ) * step( p.y, 0.3 ) * step( -aspect * 0.2, p.x ) * step( p.x, aspect * 0.42 );
    float glyph = smoothstep( 0.25, 0.15, abs( fract( row_f ) - 0.5 ) )
                  * step( 0.3, hash21( vec2( floor( p.x * 60.0 ), row ) ) )
                  * smoothstep( 0.35, 0.2, abs( fract( p.x * 60.0 ) - 0.5 ) );
    col = mix( col, vec3( 0.2, 0.12, 0.08 ), glyph * in_text * 0.85 );
    // The initial: a large square at the top left with a gilded frame and
    // the miniature (the photo) inside.
    vec2  ic = vec2( -aspect * 0.32, 0.12 );
    vec2  iq = p - ic;
    float box = step( abs( iq.x ), 0.2 ) * step( abs( iq.y ), 0.2 );
    float frame = box * ( 1.0 - step( abs( iq.x ), 0.17 ) * step( abs( iq.y ), 0.17 ) );
    vec3  mini = img( clamp( iq / 0.34 + 0.5, 0.0, 1.0 ) ) * 1.2;
    mini = mix( mini, mini * imgPalette( hue * 0.159 + 0.5 ) * 1.5, 0.2 );
    col = mix( col, mini, box - frame );
    // Gold leaf: warm yellow with a highlight sweeping across on the swell,
    // flashing on the kick, burnish dots sparkling on the treble.
    vec3  gold = vec3( 0.95, 0.75, 0.3 ) * gold_amt;
    float shine = pow( max( 1.0 - abs( ( iq.x + iq.y ) * 1.5 - ( sweep * 2.0 - 1.0 ) ), 0.0 ), 3.0 );
    vec3  gold_lit = gold * ( 0.7 + 0.8 * shine ) + vec3( 1.0, 0.95, 0.8 ) * shine * 0.4
                     + vec3( 1.0, 0.9, 0.6 ) * audioKick * 0.5;
    col = mix( col, gold_lit, frame );
    // Vines: four tendrils growing from the initial along the margins.
    float leaf1, leaf2, leaf3, leaf4;
    float v1 = vine( p, ic + vec2( 0.2, 0.15 ), vec2( 1.0, 0.0 ), aspect * 0.7 * vine_len, prog, 1.0, leaf1 );
    float v2 = vine( p, ic + vec2( -0.1, -0.2 ), vec2( 0.0, -1.0 ), 0.55 * vine_len, prog * 0.9, 2.0, leaf2 );
    float v3 = vine( p, ic + vec2( 0.2, -0.18 ), vec2( 0.6, -0.8 ), 0.5 * vine_len, prog * 0.8, 3.0, leaf3 );
    float v4 = vine( p, ic + vec2( -0.05, 0.2 ), vec2( 0.3, 1.0 ), 0.3 * vine_len, prog * 0.7, 4.0, leaf4 );
    float stem = smoothstep( 0.006, 0.002, min( min( v1, v2 ), min( v3, v4 ) ) );
    float leaf = max( max( leaf1, leaf2 ), max( leaf3, leaf4 ) );
    vec3  vine_col = mix( vec3( 0.15, 0.35, 0.15 ), imgPalette( hue * 0.159 + 0.35 ), 0.3 );
    col = mix( col, vine_col, stem );
    col = mix( col, mix( vine_col * 1.3, gold, 0.35 + 0.3 * shine ), leaf );
    // Burnished gold dots in the margins, sparkling on the treble.
    vec2  gu = p * 24.0;
    vec2  gc = floor( gu );
    vec2  gf = fract( gu ) - 0.5;
    vec2  go = vec2( hash21( gc + 1.3 ), hash21( gc + 5.9 ) ) - 0.5;
    float dot_ = smoothstep( 0.14, 0.09, length( gf - go * 0.4 ) ) * step( 0.9, hash21( gc ) ) * ( 1.0 - in_text )
                 * ( 1.0 - box );
    col = mix( col, gold * ( 0.8 + 0.6 * hi + 0.5 * shine ), dot_ );
    // Page edge shadow.
    col *= 0.85 + 0.15 * ( 1.0 - length( p / vec2( aspect * 0.5, 0.5 ) ) * 0.5 );
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
