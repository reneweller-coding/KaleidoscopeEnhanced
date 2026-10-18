#version 330 core
/*****************************************************************************\
 *                              StainedGlassRosette.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Renders a 12-fold-mirrored cathedral rose window as a Voronoi mosaic of stained-glass "panes", each a saturated,
 *  hue-rotated crop of the current slideshow image (tex0) held together by dark lead lines, backlit by radiating
 *  godrays.
 *
 *  audioSwell breathes the backlight and godray intensity; audioKick and
 *  audioDrop flare the rays and backlight further; audioChromaHue rotates
 *  both the per-pane glass hue and the godray colour with the musical key;
 *  audioAdvance slowly turns the whole rosette and animates the ray pattern.
 *  The window is a flat polar disc (vPolar/vXY from the vertex stage) facing
 *  the camera with a soft circular vignette at its rim.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// StainedGlassRosette.frag — a 12-petal kaleidoscope of Voronoi "glass"
// pieces, each a saturated, hue-varied crop of the current image, held
// together by dark lead lines; warm godrays radiate from behind, pulsing
// with the swell and flaring on the kick.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float     audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioDrop;         ///< Drop envelope: high after a detected drop, decaying.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

in vec2 vPolar; ///< angle, radius 0..1
in vec2 vXY;    ///< XY (from the vertex stage).

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

/**  Pseudo-random value(s) of the input.
 *
 * @param p  The input. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hashG( vec2 p )
{
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
/**  Pseudo-random value(s) of the input.
 *
 * @param p  The input. (in)
 *
 * @return
 *   Pseudo-random numbers, each 0..1.
 **/
vec2 hash2G( vec2 p )
{
    return fract( sin( vec2( dot( p, vec2( 127.1, 311.7 ) ),
                             dot( p, vec2( 269.5, 183.3 ) ) ) )
                  * 43758.5453 );
}

/**  Classic 2D Voronoi: returns (cell_hash, edgeDist F2-F1).
 *
 * @param p  The point. (in)
 *
 * @return
 *   The cell's hash (x), the nearest distance F1 (y) and the second nearest F2 (z).
 **/
vec3 voronoi( vec2 p )
{
    vec2  ip = floor( p ), fp = fract( p );
    float f1 = 8.0, f2 = 8.0;
    vec2  best_off = vec2( 0.0 );
    for ( int y = -1; y <= 1; ++y )
        for ( int x = -1; x <= 1; ++x )
        {
            vec2  off = vec2( float( x ), float( y ) );
            vec2  pt = off + hash2G( ip + off ) - fp;
            float d = dot( pt, pt );
            if ( d < f1 )
            {
                f2 = f1;
                f1 = d;
                best_off = ip + off;
            }
            else if ( d < f2 )
            {
                f2 = d;
            }
        }
    return vec3( hashG( best_off ), f1, f2 );
}
/**  Turns a colour's hue (a rotation about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour.
 **/
vec3 hueRotG( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float ang = vPolar.x + time * 0.02;
    float rad = vPolar.y;

    // 12-fold mirror symmetry — a rose window's repeating petals.
    const float N = 12.0;
    float       sector = 6.2831853 / N;
    float       fa = abs( mod( ang, sector * 2.0 ) - sector );

    vec2  pv = vec2( cos( fa ), sin( fa ) ) * rad * 9.0;
    vec3  vc = voronoi( pv );
    float cell_hash = vc.x;
    float lead = smoothstep( 0.0, 0.015, vc.z - vc.y ); // dark border near edges

    // Each glass piece: a seeded crop of the current image, saturated.
    vec2  crop = hash2G( vec2( cell_hash * 37.0, cell_hash * 71.0 ) ) * 0.6;
    vec2  sample_uv = crop + fract( pv * 0.15 + cell_hash * 3.0 ) * 0.4;
    vec3  pic = img( sample_uv );
    float lum = dot( pic, vec3( 0.299, 0.587, 0.114 ) );
    vec3  glass = mix( vec3( lum ), pic, 1.7 ); // extra saturation
    glass = hueRotG( glass, audioChromaHue * 0.5 + cell_hash * 2.2 );

    vec3 col = mix( vec3( 0.03, 0.02, 0.02 ), glass, lead );

    // Godrays radiating from behind the window; pulse with the swell.
    float rays = pow( 0.5 + 0.5 * sin( ang * 16.0 + audioAdvance * 0.6 ), 10.0 );
    col += hueRotG( vec3( 1.0, 0.75, 0.40 ), audioChromaHue * 0.3 )
           * rays * ( 0.35 + 0.6 * audioSwell + 0.9 * audioKick ) * ( 1.0 - rad );

    // Backlight breathing through the whole window + drop flare.
    col *= ( 0.75 + 0.35 * audioSwell + 0.6 * audioDrop );

    // Soft circular vignette so the disc has a clean rim.
    col *= smoothstep( 1.05, 0.85, rad );

    fragColor = vec4( col * 1.3, 1.0 );
}
