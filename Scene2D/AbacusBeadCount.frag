#version 330 core
/*****************************************************************************\
 *                              AbacusBeadCount.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  ABACUS BEAD COUNT: a soroban counting the music.
 *
 *  One rod per spectrum band; on each rod the beads slide toward the reckoning bar to the value of that band, so
 *  the whole frame reads as a bar chart made of wooden beads.  The beads glide -- their position is a smoothed
 *  function of the band, never a jump -- and a rod's beads brighten as they reach the bar.  The photo is the
 *  frame's wood and the felt behind.  Camera fixed on the abacus.
 *
 *  Audio Reactivity:
 *    audioSpectrum[32] -> bead positions per rod (smoothed, gliding)
 *    audioSwell        -> the lamp over the frame (slow)
 *    audioHigh         -> the lacquer sheen (light)
 *    audioKick         -> the frame is tapped: the beads glint (light)
 *    sceneAdvance      -> a slow drift of the lamp (continuous)
 *
 *  Per-activation variety: rodsP, beadsP, hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;      ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;         ///< Seconds since this scene was activated.
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.

uniform float rodsP;  ///< Rods knob, 0..1.
uniform float beadsP; ///< Beads knob, 0..1.
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
/**  Smooth 2D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise2( vec2 p )
{
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}

/**  A bead: a flattened bicone on a rod, seen from the front.
 *
 * @param q  Point relative to the bead's centre. (in)
 * @param w  Half width. (in)
 * @param h  Half height. (in)
 *
 * @return
 *   The bead's coverage, 0..1.
 **/
float beadShape( vec2 q, float w, float h )
{
    // Two cones back to back: |y|/h + |x|/w <= 1 with the corners rounded.
    float d = abs( q.y ) / max( h, 1e-3 ) + pow( abs( q.x ) / max( w, 1e-3 ), 2.2 ) - 1.0;
    return smoothstep( 0.06, -0.04, d );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float rods = 12.0 + floor( clamp( rodsP, 0.0, 1.0 ) * 8.0 );  // rods across
    float lower = 4.0 + floor( clamp( beadsP, 0.0, 1.0 ) * 2.0 ); // beads below the bar
    float lamp = 0.7 + 0.5 * clamp( audioSwell, 0.0, 1.0 );
    float hi = clamp( audioHigh * 2.0, 0.0, 1.0 );
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;

    // The felt behind the frame, and the frame itself.
    vec3 felt = img( uv * 1.1 ) * mix( vec3( 0.16, 0.1, 0.08 ), imgPalette( hue * 0.159 + 0.6 ) * 0.2, 0.45 );
    felt *= 0.75 + 0.35 * noise2( p * 120.0 );
    vec3 col = felt * lamp * 0.8;

    float frame_half = aspect * 0.45, frame_top = 0.4, frame_bot = -0.4;
    float in_frame = step( abs( p.x ), frame_half ) * step( frame_bot, p.y ) * step( p.y, frame_top );
    float bar_y = 0.12; // the reckoning bar

    if ( in_frame > 0.5 )
    {
        float t = ( p.x + frame_half ) / ( 2.0 * frame_half ) * rods;
        float ri = floor( t );
        float rf = fract( t ) - 0.5;
        float rod_x = ( ( ri + 0.5 ) / rods - 0.5 ) * 2.0 * frame_half;
        int   band = int( mod( ri, 32.0 ) );
        float e = clamp( audioSpectrum[band] * 1.7, 0.0, 1.0 );
        vec3  tint = imgPalette( hue * 0.159 + float( band ) / 32.0 ) * 1.35 + 0.15;
        // The rod: a thin bamboo pin.
        float rod_d = abs( p.x - rod_x );
        float rod_w = 0.004;
        col = mix( col, mix( vec3( 0.65, 0.55, 0.35 ), tint, 0.15 ) * lamp,
                   smoothstep( rod_w, rod_w * 0.5, rod_d ) * step( frame_bot + 0.03, p.y )
                       * step( p.y, frame_top - 0.03 ) );

        float bead_w = ( 2.0 * frame_half / rods ) * 0.42;
        float bead_h = 0.035;
        // The heaven bead above the bar: it comes DOWN to the bar when the
        // band passes half.  Its travel is a smoothstep, so it glides.
        float heaven_rest = frame_top - 0.07;
        float heaven_down = bar_y + bead_h + 0.008;
        float heaven_y = mix( heaven_rest, heaven_down, smoothstep( 0.35, 0.75, e ) );
        float hb = beadShape( vec2( p.x - rod_x, p.y - heaven_y ), bead_w, bead_h );
        float at_bar_h = smoothstep( 0.06, 0.0, abs( heaven_y - heaven_down ) );
        vec3  wood = mix( vec3( 0.5, 0.3, 0.16 ), tint, 0.2 + 0.45 * at_bar_h );
        // Bead shading: a round highlight and a dark rim.
        float shade_h = 1.0
                        - clamp( length( vec2( ( p.x - rod_x ) / bead_w, ( p.y - heaven_y ) / bead_h ) ), 0.0, 1.0 );
        vec3  bead_col_h = wood * ( 0.4 + 0.8 * sqrt( shade_h ) ) * lamp;
        bead_col_h += vec3( 1.0, 0.95, 0.85 )
                      * smoothstep(
                          0.5, 0.0,
                          length( vec2( ( p.x - rod_x ) / bead_w + 0.35, ( p.y - heaven_y ) / bead_h + 0.35 ) ) )
                      * ( 0.15 + 0.5 * hi + 0.5 * audioKick );
        bead_col_h += tint * at_bar_h * e * 0.5;
        col = mix( col, bead_col_h, hb );

        // The earth beads below: as many as the band's value slide UP to
        // the bar, the rest stay at the bottom.  Their positions are a
        // continuous function of the value, so no bead ever teleports.
        float value = e * lower; // how many are counted
        for ( int k = 0; k < 6; ++k )
        {
            float fk = float( k );
            if ( fk >= lower )
                break;
            // Rest position at the bottom, counted position under the bar.
            float rest = frame_bot + 0.06 + fk * ( bead_h * 2.1 );
            float up = bar_y - bead_h - 0.008 - fk * ( bead_h * 2.1 );
            // This bead moves once the value passes its own index.
            float moved = smoothstep( fk, fk + 0.9, value );
            float by = mix( rest, up, moved );
            float bb = beadShape( vec2( p.x - rod_x, p.y - by ), bead_w, bead_h );
            if ( bb < 0.002 )
                continue;
            float at_bar = smoothstep( 0.5, 1.0, moved );
            vec3  w2 = mix( vec3( 0.45, 0.26, 0.13 ), tint, 0.18 + 0.5 * at_bar );
            float shade = 1.0 - clamp( length( vec2( ( p.x - rod_x ) / bead_w, ( p.y - by ) / bead_h ) ), 0.0, 1.0 );
            vec3  bc = w2 * ( 0.4 + 0.8 * sqrt( shade ) ) * lamp;
            bc += vec3( 1.0, 0.95, 0.85 )
                  * smoothstep( 0.5, 0.0,
                                length( vec2( ( p.x - rod_x ) / bead_w + 0.35, ( p.y - by ) / bead_h + 0.35 ) ) )
                  * ( 0.15 + 0.5 * hi + 0.4 * audioKick );
            bc += tint * at_bar * e * 0.45;
            // The bead's shadow on the felt behind it.
            col *= 1.0
                   - 0.3 * beadShape( vec2( p.x - rod_x - 0.006, p.y - by + 0.006 ), bead_w, bead_h ) * ( 1.0 - bb );
            col = mix( col, bc, bb );
        }
        // The reckoning bar across every rod.
        float bar = step( abs( p.y - bar_y ), 0.012 );
        vec3  bar_col = mix( vec3( 0.35, 0.22, 0.12 ), imgPalette( hue * 0.159 + 0.08 ), 0.25 );
        bar_col *= 0.7 + 0.4 * noise2( p * 70.0 );
        col = mix( col, bar_col * lamp, bar );
        col += vec3( 1.0, 0.95, 0.85 ) * smoothstep( 0.004, 0.0, abs( p.y - bar_y - 0.008 ) ) * ( 0.2 + 0.5 * hi );
        // The unit dots on the bar every fifth rod.
        col = mix( col, vec3( 0.85, 0.8, 0.6 ) * lamp,
                   smoothstep( 0.005, 0.002, length( vec2( p.x - rod_x, p.y - bar_y ) ) )
                       * step( 4.5, mod( ri, 5.0 ) ) );
    }
    // The frame: four rails of dark wood.
    float rail = step( abs( p.x ), frame_half + 0.03 ) * step( frame_bot - 0.03, p.y ) * step( p.y, frame_top + 0.03 )
                 * ( 1.0 - in_frame );
    vec3  rail_col = img( clamp( vec2( uv.x * 0.5, 0.3 ), 0.0, 1.0 ) )
                     * mix( vec3( 0.3, 0.18, 0.1 ), imgPalette( hue * 0.159 + 0.06 ), 0.25 );
    rail_col *= 0.7 + 0.45 * noise2( p * 40.0 );
    col = mix( col, rail_col * lamp, rail );
    col += vec3( 1.0, 0.93, 0.8 ) * rail * smoothstep( 0.01, 0.0, abs( p.y - frame_top - 0.015 ) ) * ( 0.2 + 0.4 * hi );
    col *= 0.9 + 0.2 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
