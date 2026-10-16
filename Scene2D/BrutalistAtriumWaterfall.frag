#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file BrutalistAtriumWaterfall.frag
 * @brief BRUTALIST ATRIUM WATERFALL: a tall concrete atrium, galleries on both
 * sides stacked floor over floor, their board-marked slabs carrying
 * planters from which green vines hang down, and at the far end a
 * waterfall pouring over the whole height of the end wall into a pool.
 * Daylight falls from a skylight high above, straight into the spray, so
 * the mist glows and shafts of light stand in it; droplets glitter.  The
 * camera is still; the water falls and the mist drifts.
 *
 * The galleries are traced analytically (slabs as boxes, the vines as a
 * hanging curtain plane in front of each).
 *
 * Audio Reactivity:
 *   audioSwell  -> the mist and its glow (slow)
 *   audioBass   -> the brightness of the falling water (light)
 *   audioHigh   -> glittering droplets in the spray (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the falling water, the drifting mist
 *
 * Per-activation variety: plantsP (how green the galleries are), hueP.
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float plantsP;
uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
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
/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec2 p )
{
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        v += a * noise2( p );
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 2.3;
        a *= 0.5;
    }
    return v;
}

const float Aw = 6.0;  ///< half width of the atrium (the gallery walls)
const float Se = 4.4;  ///< slab edge
const float Fh = 3.6;  ///< floor height
const float Zf = 26.0; ///< the end wall
const int   Nf = 10;   ///< floors

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float bass = clamp( audioBass, 0.0, 1.0 );
    float hi = clamp( audioHigh * 2.0, 0.0, 1.0 );
    float T = sceneTime + sceneAdvance * 0.4;
    float plants = 0.4 + 0.6 * clamp( plantsP, 0.0, 1.0 );

    // Standing on the ground floor, looking down the atrium and up.
    vec3 ro = vec3( 0.3, 1.6, 0.0 );
    vec3 rd = normalize( vec3( p.x, p.y + 0.28, 0.95 ) );

    vec3  concrete = vec3( 0.56, 0.54, 0.5 );
    float t_hit = ( Zf - ro.z ) / rd.z;
    int   mat = 0; // 0 end wall, 1 slab edge, 2 slab under, 3 slab top, 4 gallery wall, 5 vines, 6 floor, 7 sky
    float vine_shade = 0.0;
    // The ground and the skylight.
    if ( rd.y < 0.0 )
    {
        float t = -ro.y / rd.y;
        if ( t < t_hit )
        {
            t_hit = t;
            mat = 6;
        }
    }
    float y_top = float( Nf ) * Fh;
    if ( rd.y > 0.0 )
    {
        float t = ( y_top - ro.y ) / rd.y;
        if ( t < t_hit )
        {
            t_hit = t;
            mat = 7;
        }
    }
    // The side the ray heads to: gallery wall and slabs.
    float sx = sign( rd.x );
    {
        float t = ( sx * Aw - ro.x ) / rd.x;
        if ( t > 0.0 && t < t_hit )
        {
            t_hit = t;
            mat = 4;
        }
    }
    float t_edge = ( sx * Se - ro.x ) / rd.x;
    if ( t_edge > 0.0 && t_edge < t_hit )
    {
        // At the slab edge plane: which floor, and is the ray inside a slab?
        vec3  E = ro + rd * t_edge;
        float fl = floor( E.y / Fh + 0.5 );
        float dy = E.y - fl * Fh;
        if ( fl >= 1.0 && fl < float( Nf ) && dy < 0.05 && dy > -0.45 )
        {
            t_hit = t_edge;
            mat = 1;
        }
        else if ( fl >= 1.0 && fl < float( Nf ) )
        {
            // Between the edge and the wall the ray may hit a slab's top or underside.
            float y_s = ( dy > 0.0 ) ? fl * Fh + 0.05 : fl * Fh - 0.45;
            float t = ( y_s - ro.y ) / rd.y;
            float tw = ( sx * Aw - ro.x ) / rd.x;
            if ( t > t_edge && t < tw && t < t_hit )
            {
                t_hit = t;
                mat = dy > 0.0 ? 3 : 2;
            }
            // Vines hanging from the planter on the slab above, just in front of the edge.
            float tv = ( sx * ( Se - 0.1 ) - ro.x ) / rd.x;
            vec3  V = ro + rd * tv;
            float fl_a = floor( V.y / Fh ) + 1.0;
            float hang = fl_a * Fh - 0.45 - V.y; // how far below the slab
            // Individual strands, each with its own length, leaves clumped on it.
            float sz = V.z * 6.0;
            float si = floor( sz );
            float sh = hash21( vec2( si, fl_a * 7.0 ) );
            float sw = abs( fract( sz ) - 0.5 - 0.2 * ( sh - 0.5 ) );
            float fwz = fwidth( sz ) + 1e-3;
            float strand = smoothstep( 0.22 + fwz, 0.22 - fwz, sw + 0.06 * sin( hang * 9.0 + sh * 20.0 ) );
            float len = ( 0.3 + 2.6 * plants * sh * sh )
                        * step( 0.45 - 0.35 * plants, hash21( vec2( si, fl_a * 7.0 + 3.0 ) ) );
            float clump = 0.6 + 0.4 * noise2( vec2( sz * 2.0, hang * 6.0 ) );
            float cov = strand * smoothstep( len, len - 0.25, hang ) * step( 0.0, hang ) * clump;
            if ( cov > 0.3 && tv < t_hit && fl_a < float( Nf ) + 0.5 && fl_a >= 1.0 )
            {
                t_hit = tv;
                mat = 5;
                vine_shade = cov * ( 0.6 + 0.4 * noise2( V.zy * 6.0 ) );
            }
        }
    }
    vec3 P = ro + rd * t_hit;

    // Light: the skylight above; up-facing surfaces bright, undersides dim.
    float h_light = 0.35 + 0.65 * smoothstep( 0.0, y_top, P.y );
    vec3  col;
    float board = 0.9 + 0.1 * sin( P.y * 18.0 + noise2( P.xz * 2.0 ) * 2.0 ) * 0.5
                  + 0.1 * noise2( P.zy * vec2( 3.0, 0.5 ) );
    if ( mat == 1 )
        col = concrete * board * 0.55 * h_light;
    else if ( mat == 2 )
        col = concrete * 0.18 * h_light;
    else if ( mat == 3 )
        col = concrete * 0.8 * h_light;
    else if ( mat == 4 )
    {
        // Deep inside the galleries: dark, with lit windows of the offices.
        float fl = floor( P.y / Fh );
        float wz = fract( P.z / 2.5 );
        float win = step( abs( wz - 0.5 ), 0.3 ) * step( 0.9, P.y - fl * Fh ) * step( P.y - fl * Fh, 2.6 );
        float wlit = step( 0.55, hash21( vec2( floor( P.z / 2.5 ), fl ) ) );
        col = concrete * 0.07 * ( 1.0 - 0.5 * win ) + vec3( 1.0, 0.82, 0.55 ) * win * 0.1 * wlit;
    }
    else if ( mat == 5 )
    {
        vec3 leaf = mix( vec3( 0.12, 0.3, 0.08 ), vec3( 0.3, 0.5, 0.15 ), vine_shade );
        leaf = mix( leaf, imgPalette( 0.3 + hueP * 0.159 ) * vec3( 0.4, 0.7, 0.3 ), 0.15 );
        col = leaf * ( 0.4 + 0.7 * h_light );
    }
    else if ( mat == 6 )
    {
        // The pool in front of the waterfall and the stone floor.
        float pool = step( Zf - 5.0, P.z ) * step( abs( P.x ), 3.2 );
        col = concrete * 0.3;
        if ( pool > 0.5 )
        {
            float rip = noise2( P.xz * vec2( 4.0, 2.0 ) + vec2( 0.0, -T * 0.6 ) );
            col = mix( vec3( 0.1, 0.14, 0.15 ), vec3( 0.8, 0.9, 1.0 ) * 0.7, 0.3 + 0.3 * rip );
        }
    }
    else if ( mat == 7 )
    {
        col = vec3( 1.0, 1.0, 0.97 ) * 2.2;
    }
    else
    {
        // The end wall and the waterfall pouring down its middle.
        float wf = smoothstep( 3.0, 2.6, abs( P.x ) ) * step( P.y, y_top );
        col = concrete * 0.5 * h_light * board;
        if ( wf > 0.0 )
        {
            // Streaks of water falling, the sheet torn into ropes and veils.
            float fall = P.y + T * 3.0;
            float ropes = noise2( vec2( P.x * 14.0, fall * 0.4 ) ) * 0.6
                          + noise2( vec2( P.x * 40.0, fall * 1.2 ) ) * 0.4;
            vec3  water = mix( vec3( 0.5, 0.62, 0.7 ), vec3( 1.0 ), smoothstep( 0.35, 0.85, ropes ) );
            water *= ( 0.8 + 0.5 * h_light ) * ( 0.9 + 0.5 * bass );
            col = mix( col, water, wf * ( 0.6 + 0.4 * ropes ) );
        }
    }

    // Distance haze toward the bright end of the atrium.
    col = mix( col, vec3( 0.75, 0.78, 0.8 ) * ( 0.6 + 0.6 * h_light ), 1.0 - exp( -t_hit * 0.02 ) );

    // The spray: glowing mist in front of the waterfall, rising and drifting,
    // lit from above; shafts of light standing in it.
    {
        vec2  sp = p - vec2( 0.0, -0.05 );
        float mist_zone = exp( -pow( sp.x / 0.28, 2.0 ) ) * smoothstep( 0.35, -0.3, sp.y );
        float mist = fbm( vec2( p.x * 4.0, p.y * 3.0 - T * 0.08 ) ) * mist_zone;
        col += vec3( 0.95, 0.97, 1.0 ) * mist * ( 0.25 + 0.4 * swell );
        float shafts = pow( 0.5 + 0.5 * sin( p.x * 30.0 + 2.0 * fbm( vec2( p.x * 3.0, 0.0 ) ) ), 6.0 );
        col += vec3( 1.0, 0.98, 0.9 ) * shafts * mist_zone * smoothstep( -0.4, 0.4, p.y ) * 0.12
               * ( 0.5 + 0.8 * swell );
        // Droplets glittering in the spray: round, winking.
        vec2  g = p * 90.0 + vec2( 0.0, T * 3.0 ), gi = floor( g ), gf = fract( g );
        vec2  gc = 0.25 + 0.5 * vec2( hash21( gi ), hash21( gi + 3.0 ) );
        float tw = 0.5 + 0.5 * sin( T * 3.0 + hash21( gi + 7.0 ) * 40.0 );
        col += vec3( 1.0 ) * smoothstep( 0.13, 0.0, length( gf - gc ) ) * step( 0.85, hash21( gi + 5.0 ) ) * tw
               * mist_zone * ( 0.2 + 1.0 * hi );
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
