#version 330 core
/*****************************************************************************\
 *                              SpectrumStalactiteCave.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SPECTRUM STALACTITE CAVE: a limestone cave whose stalactites hang one per spectral band across the ceiling, the
 *  bass bands the thickest and longest.
 *
 *  Each band's energy lights its stalactite from within (calcite glow) and lets it drip: drops form at the tip and
 *  fall as round beads on a continuous clock, brighter on onsets.  Below, a still pool mirrors it all in the
 *  photo's colours.  The camera never moves.
 *
 *  Audio Reactivity:
 *    audioSpectrum[32] -> stalactite glow and drip rate (light)
 *    audioOnset        -> drops flash (light)
 *    sceneAdvance      -> drip fall (continuous)
 *    audioSwell        -> torchlight (slow)
 *    audioLevel        -> brightness
 *
 *  Per-activation variety: lengthP, poolP, hueP.
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
uniform float audioOnset;        ///< Onset envelope (any instrument), 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.

uniform float lengthP; ///< Length knob, 0..1.
uniform float poolP;   ///< Pool knob, 0..1.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float length_scale = 0.5 + 0.5 * clamp( lengthP, 0.0, 1.0 );
    float pool_y = -0.28 - 0.1 * clamp( poolP, 0.0, 1.0 );
    float torch = 0.5 + 0.7 * clamp( audioSwell, 0.0, 1.0 );

    // Mirror the lower part in the pool (with a ripple).
    float in_pool = step( p.y, pool_y );
    vec2  q = p;
    if ( in_pool > 0.5 )
    {
        float rip = 0.006 * sin( p.x * 40.0 + sceneAdvance * 2.0 ) + 0.004 * sin( p.x * 23.0 - sceneAdvance * 1.3 );
        q.y = 2.0 * pool_y - p.y + rip;
    }

    // Cave wall: the photo as wet limestone, dark, torch-lit from below.
    vec3 wall = img( vec2( q.x / aspect + 0.5, q.y + 0.5 ) )
                * mix( vec3( 0.35 ), imgPalette( hue * 0.159 + 0.55 ) * 0.6, 0.5 );
    wall *= ( 0.3 + 0.7 * exp( -abs( q.y - pool_y ) * 2.0 ) ) * torch;
    vec3 col = wall;

    // Stalactites: 32 across the ceiling, band k at x_k; length and
    // thickness from the band index (bass longest); the band energy lights
    // it from within and sets its drip.
    float ceiling = 0.5;
    for ( int k = 0; k < 32; ++k )
    {
        float fk = float( k );
        float e = clamp( audioSpectrum[k] * 1.6, 0.0, 1.0 );
        float x = ( fk + 0.5 ) / 32.0 * aspect - aspect * 0.5 + ( hash11( fk * 3.3 ) - 0.5 ) * 0.02;
        float len = ( 0.25 + 0.45 * ( 1.0 - fk / 32.0 ) * length_scale ) * ( 0.8 + 0.4 * hash11( fk * 5.1 ) );
        float thick = 0.012 + 0.02 * ( 1.0 - fk / 32.0 );
        float tip_y = ceiling - len;
        float dy = ceiling - q.y; // distance down from the ceiling
        float half_w = thick * ( 1.0 - clamp( dy / len, 0.0, 1.0 ) ) * ( 1.0 + 0.2 * noise2( vec2( fk, dy * 20.0 ) ) );
        float dx = abs( q.x - x );
        float inside = step( dx, half_w ) * step( q.y, ceiling ) * step( tip_y, q.y );
        if ( inside > 0.5 )
        {
            float nx = dx / max( half_w, 1e-3 );
            float shade = 0.4 + 0.6 * sqrt( max( 1.0 - nx * nx, 0.0 ) );
            vec3  calc = mix( vec3( 0.85, 0.8, 0.7 ), imgPalette( hue * 0.159 + fk / 32.0 ), 0.35 );
            vec3  st = calc * shade * ( 0.35 + 0.4 * torch );
            st += imgPalette( hue * 0.159 + fk / 32.0 ) * e * 1.2 * shade; // the glow from within
            col = st;
        }
        // Drips: a round bead forming at the tip and falling on the clock
        // (rate 1..3 per period scaled by the band energy as amplitude of
        // brightness, never of the clock).
        float drip_clock = sceneAdvance * ( 0.6 + 0.3 * hash11( fk * 7.7 ) ) + sceneTime * 0.1 + hash11( fk * 9.1 );
        float ph = fract( drip_clock );
        float drop_y = tip_y - ph * ph * ( tip_y - pool_y + 0.02 );
        float dd = length( vec2( q.x - x, q.y - drop_y ) * vec2( 1.0, 0.8 ) );
        float bead = smoothstep( 0.012, 0.004, dd ) * step( q.y, tip_y + 0.01 );
        float onset = clamp( audioOnset, 0.0, 1.0 );
        col += mix( vec3( 0.7, 0.85, 1.0 ), imgPalette( hue * 0.159 + fk / 32.0 ), 0.4 ) * bead
               * ( 0.3 + 0.9 * e + 0.8 * onset );
        // Splash rings on the pool surface where the drop lands.
        float ring = exp( -abs( length( vec2( ( p.x - x ) * 1.0, ( p.y - pool_y ) * 4.0 ) ) - ph * 0.12 ) * 60.0 )
                     * ( 1.0 - ph ) * step( 0.85, ph + 0.15 ) * in_pool;
        col += vec3( 0.6, 0.75, 0.9 ) * ring * 0.25 * ( 0.3 + e );
    }
    // The pool: darker, bluer, the reflection dimmed.
    col = mix( col, col * vec3( 0.5, 0.65, 0.85 ) * 0.7 + imgPalette( hue * 0.159 + 0.6 ) * 0.05, in_pool );
    // Torch glow near the pool line.
    col += imgPalette( hue * 0.159 + 0.1 ) * exp( -abs( p.y - pool_y ) * 6.0 ) * 0.12 * torch;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
