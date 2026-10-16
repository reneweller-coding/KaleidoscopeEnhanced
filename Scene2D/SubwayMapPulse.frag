#version 330 core
/*****************************************************************************\
 *                              SubwayMapPulse.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SUBWAY MAP PULSE: a transit diagram in the style of a network map -- straight runs, forty-five degree bends,
 *  interchange circles.
 *
 *  Twelve lines, one per chroma class; a train runs each line as a pulse of light on the scene clock, and a station
 *  lights as its line sounds. The photo is the printed paper the map sits on.  Camera fixed on the map.
 *
 *  Audio Reactivity:
 *    audioChroma[12] -> line brightness and its stations (light)
 *    sceneAdvance    -> the trains run (continuous)
 *    audioSwell      -> the paper light (slow)
 *    audioKick       -> interchange rings flash (light)
 *    audioLevel      -> brightness
 *
 *  Per-activation variety: linesP, benchP (layout), hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
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
uniform float audioLevel;      ///< Overall loudness, 0..1.
uniform float audioChromaHue;  ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;    ///< Mood valence: 0 dark .. 1 bright.

uniform float linesP; ///< Lines knob, 0..1.
uniform float benchP; ///< Bench knob: layout, 0..1.
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

/**  Distance from a point to a segment, and the parameter there.
 *
 * @param p  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 * @param t  Receives the parameter of the closest point, 0..1. (out)
 *
 * @return
 *   The distance.
 **/
float segD( vec2 p, vec2 a, vec2 b, out float t )
{
    vec2 d = b - a;
    t = clamp( dot( p - a, d ) / max( dot( d, d ), 1e-6 ), 0.0, 1.0 );
    return length( p - ( a + d * t ) );
}

/**  Node k of line L: a polyline with only horizontal, vertical and diagonal runs, which is what makes a diagram read
 * as a transit map.
 *
 * @param L       Index of the line. (in)
 * @param k       Index of the node. (in)
 * @param aspect  Aspect of the screen. (in)
 * @param bench   Layout knob. (in)
 *
 * @return
 *   The node's position.
 **/
vec2 node( float L, float k, float aspect, float bench )
{
    float seed = L * 4.7 + k * 1.31;
    // Start on the left rim, walk right in steps; the direction is one of
    // three, chosen per node but fixed for the activation.
    float x = -aspect * 0.44 + k * ( aspect * 0.88 / 6.0 );
    float y = ( hash11( L * 3.3 ) - 0.5 ) * 0.5;
    // Accumulate the walk so the line is continuous.
    for ( float i = 1.0; i <= 6.0; i += 1.0 )
    {
        if ( i > k )
            break;
        float r = hash11( seed * 0.0 + L * 9.1 + i * 2.7 );
        float step_ = ( r < 0.33 ) ? -1.0 : ( r < 0.66 ? 0.0 : 1.0 );
        y += step_ * ( 0.06 + 0.06 * bench );
    }
    return vec2( x, clamp( y, -0.42, 0.42 ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float lines = 6.0 + floor( clamp( linesP, 0.0, 1.0 ) * 6.0 ); // once per activation
    float bench = clamp( benchP, 0.0, 1.0 );
    float light = 0.7 + 0.5 * clamp( audioSwell, 0.0, 1.0 );
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The paper: the photo, washed out to a printed cream, with fibre grain.
    vec3 paper = mix( vec3( 0.94, 0.93, 0.89 ), img( uv ), 0.22 ) * light;
    paper *= 0.97 + 0.03 * img( uv * 4.0 ).r;
    vec3 col = paper;
    // Water and park blocks, the pale shapes a map has behind its lines.
    float river = smoothstep( 0.05, 0.0, abs( p.y + 0.28 + 0.09 * sin( p.x * 2.2 ) ) );
    col = mix( col, mix( paper, vec3( 0.72, 0.85, 0.95 ), 0.55 ), river * 0.8 );
    float park = smoothstep( 0.13, 0.1, length( ( p - vec2( 0.32, 0.24 ) ) * vec2( 1.0, 1.4 ) ) );
    col = mix( col, mix( paper, vec3( 0.8, 0.9, 0.75 ), 0.6 ), park * 0.8 );

    // The lines.  Each is a 7-node polyline drawn as a thick round-capped
    // stroke; a pulse of light runs along it on the clock.
    float inter_d = 1e9; // nearest interchange
    float inter_e = 0.0;
    for ( int L = 0; L < 12; ++L )
    {
        if ( float( L ) >= lines )
            break;
        float f_l = float( L );
        float e = clamp( audioChroma[L] * 1.6, 0.0, 1.0 );
        vec3  lc = imgPalette( hue * 0.159 + f_l / 12.0 ) * 1.35 + 0.1;
        // Run position along the whole line, in node units.
        float train_pos = fract( clock * ( 0.055 + 0.02 * hash11( f_l * 5.3 ) ) + hash11( f_l * 7.1 ) ) * 6.0;
        float best = 1e9, best_s = 0.0;
        for ( int k = 0; k < 6; ++k )
        {
            vec2  a = node( f_l, float( k ), aspect, bench );
            vec2  b = node( f_l, float( k ) + 1.0, aspect, bench );
            float t;
            float d = segD( p, a, b, t );
            if ( d < best )
            {
                best = d;
                best_s = float( k ) + t;
            }
        }
        float w = 0.013;
        float stroke = smoothstep( w, w * 0.6, best );
        col = mix( col, lc * ( 0.55 + 0.45 * e ) * light, stroke );
        // The train: a bright bead running along, with a short tail.
        float ahead = best_s - train_pos;
        float tail = exp( -max( -ahead, 0.0 ) * 3.2 ) * smoothstep( 0.35, 0.0, max( ahead, 0.0 ) );
        col += lc * stroke * tail * ( 0.6 + 1.0 * e ) * 1.5;
        col += lc * smoothstep( w * 2.4, 0.0, best ) * exp( -abs( ahead ) * 14.0 ) * ( 0.3 + 0.7 * e );
        // Stations: a tick at every node, an interchange circle at the ends.
        for ( int k = 0; k <= 6; ++k )
        {
            vec2  n = node( f_l, float( k ), aspect, bench );
            float dn = length( p - n );
            if ( k == 0 || k == 6 )
            {
                float ring = smoothstep( 0.024, 0.019, dn ) * smoothstep( 0.012, 0.017, dn );
                col = mix( col, vec3( 0.12 ) * light, ring );
                col = mix( col, paper, smoothstep( 0.013, 0.011, dn ) );
                if ( dn < inter_d )
                {
                    inter_d = dn;
                    inter_e = e;
                }
            }
            else
            {
                float tick = smoothstep( 0.009, 0.004, dn );
                col = mix( col, lc * ( 0.4 + 0.6 * e ) * light, tick );
                col += lc * smoothstep( 0.02, 0.006, dn ) * e * 0.5;
            }
        }
    }
    // Interchange rings pulse on the kick, only right at the interchange.
    col += vec3( 0.95, 0.92, 0.85 ) * smoothstep( 0.03, 0.014, inter_d ) * audioKick * ( 0.3 + 0.7 * inter_e );
    // A fold crease and the printed border, so it reads as a paper map.
    col *= 1.0 - 0.08 * smoothstep( 0.012, 0.0, abs( p.x - 0.02 ) );
    float border = smoothstep( 0.006, 0.0, abs( max( abs( p.x ) - aspect * 0.47, abs( p.y ) - 0.45 ) ) );
    col = mix( col, vec3( 0.2, 0.2, 0.22 ) * light, border );
    col *= 0.9 + 0.2 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
