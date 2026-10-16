#version 330 core
/*****************************************************************************\
 *                              SpiralStairwellDescent.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SPIRAL STAIRWELL DESCENT: looking straight down an endless spiral staircase.
 *
 *  The steps wind around a central well; the camera descends steadily on the scene clock, so the steps rise toward
 *  us and pass, and the well below stays a dark eye.  The steps carry the photo as inlaid treads; lamps on every
 *  turn glow with the bands; the kick lights the banister.  The descent is periodic in one step, so it is seamless;
 *  the camera never jolts.
 *
 *  Audio Reactivity:
 *    sceneAdvance      -> the descent (music-paced, periodic)
 *    audioSpectrum[32] -> lamp brightness per turn (light)
 *    audioKick         -> banister flash (light)
 *    audioSwell        -> well glow from below (slow)
 *    audioLevel        -> brightness
 *
 *  Per-activation variety: turnsP (steps per turn), wellP (well radius), hueP.
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
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.

uniform float turnsP; ///< Turns knob: steps per turn, 0..1.
uniform float wellP;  ///< Well knob: well radius, 0..1.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float       hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float       steps_per_turn = 12.0 + 8.0 * clamp( turnsP, 0.0, 1.0 );
    float       r_in = 0.12 + 0.1 * clamp( wellP, 0.0, 1.0 );    // the well
    const float r_out = 1.0;                                     // outer wall
    float       rise_total = 1.0;                                // height of one turn
    float       descent = sceneAdvance * 0.5 + sceneTime * 0.12; // in turns

    // Looking down the axis: each pixel is a ray from the eye at height 0
    // down into the well.  A point at depth d (below the eye) at radius r
    // projects to screen radius r / (d * 0.52).  Invert: for this pixel with
    // screen radius R and angle a, the ray hits the staircase at the depth
    // where the helix's step surface is at radius R * d * 0.52.
    float R = length( p );
    float a = atan( p.y, p.x );
    vec3  col = vec3( 0.0 );
    // March depth: the step surfaces are the treads (horizontal) at heights
    // that depend on the angle: tread height h(theta) = -(theta / 2pi +
    // stepIndex) * rise_total, quantised into steps.  We march d and test
    // whether the radius at that depth is between r_in and r_out and whether
    // the tread at that angle is above the ray.
    float trans = 1.0;
    float hit_d = -1.0;
    float hit_r = 0.0;
    float hit_ang = 0.0;
    float hit_step = 0.0;
    float wall_hit = 0.0;
    float d = 0.15;
    for ( int i = 0; i < 90; ++i )
    {
        float r = R * d * 0.52 * 2.0; // radius at this depth
        if ( r > r_out )
        {
            wall_hit = 1.0;
            hit_d = d;
            hit_r = r;
            hit_ang = a;
            break;
        }
        if ( r > r_in )
        {
            // Tread height at this angle (helix descending clockwise): the
            // continuous helix height plus the quantisation into steps.
            float turns_here = ( a / 6.2831853 );                                      // -0.5..0.5
            float k = floor( ( d + descent - turns_here * rise_total ) / rise_total ); // which turn
            float h_helix = ( turns_here + k ) * rise_total - descent; // height (depth) of the helix at this angle in
                                                                       // turn
                                                                       // k
            float step_idx = floor( turns_here * steps_per_turn + k * steps_per_turn );
            float h_step = ( step_idx / steps_per_turn ) * rise_total - descent;
            // The ray at depth d has passed the tread if d >= h_step (tread is
            // a horizontal surface at depth h_step, at this angle).
            if ( d >= h_step && d < h_step + 0.02 + 0.06 )
            {
                hit_d = h_step;
                hit_r = r;
                hit_ang = a;
                hit_step = step_idx;
                break;
            }
        }
        d += 0.045 + d * 0.03;
        if ( d > 9.0 )
            break;
    }
    if ( hit_d > 0.0 )
    {
        if ( wall_hit > 0.5 )
        {
            // Outer wall: stone with lamps at every turn.
            float turn = fract( ( hit_d + descent ) / rise_total );
            float lamp = pow( 0.5 + 0.5 * cos( turn * 6.2831853 ), 20.0 );
            int   band = int( mod( floor( ( hit_d + descent ) / rise_total ) + 8.0, 32.0 ) );
            float e = clamp( audioSpectrum[band] * 1.6, 0.0, 1.0 );
            vec3  stone = imgPalette( hue * 0.159 + 0.6 ) * 0.25 * ( 0.5 + 0.5 * cos( hit_ang * 24.0 ) * 0.2 );
            col = stone * ( 0.4 + 0.6 * audioLevel ) + imgPalette( hue * 0.159 + 0.05 ) * lamp * ( 0.4 + 1.6 * e );
        }
        else
        {
            // A tread: the photo inlaid, radial grain, nosing highlight.
            float u = ( hit_r - r_in ) / ( r_out - r_in );
            vec2  uv = vec2( fract( hit_step / steps_per_turn * 3.0 ), u );
            vec3  tread = img( uv ) * imgPalette( hue * 0.159 + 0.15 ) * 1.6;
            float nose = exp( -abs( fract( hit_ang / 6.2831853 * steps_per_turn ) - 0.5 ) * 12.0 );
            col = tread * ( 0.5 + 0.5 * audioLevel )
                  + imgPalette( hue * 0.159 + 0.9 ) * nose * ( 0.15 + 0.6 * audioKick ) * step( 0.85, u );
            // Banister at the inner edge.
            float ban = exp( -abs( u - 0.06 ) * 30.0 );
            col += imgPalette( hue * 0.159 + 0.85 ) * ban * ( 0.3 + 1.0 * audioKick );
        }
        float fog = 1.0 - exp( -hit_d * 0.35 );
        col = mix( col, imgPalette( hue * 0.159 + 0.6 ) * 0.04, clamp( fog, 0.0, 0.92 ) );
    }
    else
    {
        // The well: dark, a glow from far below on the swell.
        col = imgPalette( hue * 0.159 + 0.1 ) * exp( -R * 6.0 ) * ( 0.15 + 0.6 * clamp( audioSwell, 0.0, 1.0 ) );
    }

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
