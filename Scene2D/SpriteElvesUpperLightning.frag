#version 330 core
/*****************************************************************************\
 *                              SpriteElvesUpperLightning.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SPRITES AND ELVES: the lightning above the storm.
 *
 *  A thundercloud on the horizon glows from within with the bass; above it, red sprites -- columns of tendrils
 *  reaching up to the ionosphere -- flare on the kick (light: their shapes are fixed per column, only their
 *  brightness comes and goes), and elves -- expanding rings of light at the base of the ionosphere -- are launched
 *  on the scene clock and spread outward.  The photo is the night landscape below and the star sky above.  Camera
 *  still.
 *
 *  Audio Reactivity:
 *    audioKick    -> sprites flare (light)
 *    audioBass    -> the cloud glows from within (light)
 *    sceneAdvance -> elves launch and expand (continuous)
 *    audioHigh    -> the tendril tips sparkle (light)
 *    audioLevel   -> brightness
 *
 *  Per-activation variety: columnsP, elveP, hueP.
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
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float columnsP; ///< Columns knob, 0..1.
uniform float elveP;    ///< Elve knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
        p = p * 2.03 + 5.0;
        a *= 0.5;
    }
    return v;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    int   n_cols = 3 + int( clamp( columnsP, 0.0, 1.0 ) * 4.0 );
    float elve_rate = 0.5 + 0.5 * clamp( elveP, 0.0, 1.0 );
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float bass = clamp( audioBass, 0.0, 1.0 );
    vec3  red = mix( vec3( 1.0, 0.25, 0.3 ), imgPalette( hue * 0.159 + 0.0 ), 0.25 );
    vec3  blue = mix( vec3( 0.4, 0.5, 1.0 ), imgPalette( hue * 0.159 + 0.6 ), 0.3 );

    // Night sky with round stars; the ionosphere as a faint band high up.
    vec3 col = mix( vec3( 0.01, 0.012, 0.03 ), vec3( 0.03, 0.03, 0.06 ), p.y + 0.5 );
    vec2 su = p * 90.0;
    vec2 sc = floor( su );
    vec2 sf = fract( su ) - 0.5;
    vec2 so = vec2( hash21( sc + 1.3 ), hash21( sc + 5.9 ) ) - 0.5;
    col += vec3( 0.75 ) * smoothstep( 0.14, 0.03, length( sf - so * 0.6 ) ) * step( 0.985, hash21( sc ) );
    float ion_y = 0.36;
    col += blue * 0.06 * exp( -abs( p.y - ion_y ) * 12.0 );

    // Elves: rings expanding outward at the ionosphere, launched on the clock.
    for ( int k = 0; k < 3; ++k )
    {
        float fk = float( k );
        float ph = fract( clock * elve_rate * ( 0.6 + 0.3 * hash11( fk * 3.1 ) ) + fk * 0.33 );
        float cx = ( hash11( fk * 7.7 + floor( clock * elve_rate * ( 0.6 + 0.3 * hash11( fk * 3.1 ) ) + fk * 0.33 ) )
                     - 0.5 )
                   * aspect * 0.8;
        float rr = length( ( p - vec2( cx, ion_y ) ) * vec2( 1.0, 6.0 ) );
        float ring = exp( -abs( rr - ph * 0.9 ) * 25.0 ) * ( 1.0 - ph ) * ( 1.0 - ph );
        col += blue * ring * 0.8;
    }

    // Sprites: columns of tendrils above the cloud, each a fixed fbm shape,
    // brightness = kick times a per-column response so they alternate.
    float kick = clamp( audioKick, 0.0, 1.0 );
    for ( int i = 0; i < 7; ++i )
    {
        if ( i >= n_cols )
            break;
        float fi = float( i );
        float cx = ( hash11( fi * 3.3 ) - 0.5 ) * aspect * 0.9;
        float w = 0.05 + 0.06 * hash11( fi * 5.9 );
        float base = -0.05, top = 0.32;
        float h = clamp( ( p.y - base ) / ( top - base ), 0.0, 1.0 );
        float spread_w = w * ( 0.4 + 1.6 * h ); // tendrils spread upward
        float dx = abs( p.x - cx );
        float body = smoothstep( spread_w, spread_w * 0.2, dx );
        float tendril = pow( fbm( vec2( ( p.x - cx ) * 40.0, p.y * 6.0 + fi * 9.0 ) ), 2.0 ) * 3.0;
        float column = body * tendril * smoothstep( 0.0, 0.15, h ) * ( 1.0 - smoothstep( 0.85, 1.0, h ) );
        // The bright halo at the top of each sprite.
        float halo = exp( -length( vec2( dx, p.y - top * 0.85 ) * vec2( 1.0, 2.0 ) ) * 8.0 ) * 0.6;
        float response = kick * ( 0.35 + 0.65 * hash11( fi * 2.7 + floor( sceneAdvance * 0.5 ) ) );
        col += red * ( column + halo ) * response * 1.6;
        col += vec3( 1.0, 0.8, 0.8 ) * column * clamp( audioHigh * 2.0, 0.0, 1.0 ) * response * step( 0.7, h ) * 0.6;
    }

    // The thundercloud: a dark mass on the horizon lit from inside by the
    // bass, with the landscape (photo) below.
    float cloud_top = -0.05 + 0.05 * fbm( vec2( p.x * 3.0, 2.0 ) );
    float cloud = step( p.y, cloud_top ) * step( -0.3, p.y );
    vec3  cloud_col = vec3( 0.05, 0.04, 0.06 )
                      + imgPalette( hue * 0.159 + 0.1 ) * ( 0.2 + 0.9 * bass )
                            * pow( fbm( vec2( p.x * 4.0 + clock * 0.2, p.y * 6.0 ) ), 1.5 ) * 1.5;
    col = mix( col, cloud_col, cloud );
    float ground = step( p.y, -0.3 );
    vec3  land = img( vec2( p.x / aspect + 0.5, ( p.y + 0.5 ) * 0.6 ) ) * 0.15 * imgPalette( hue * 0.159 + 0.55 );
    col = mix( col, land, ground );
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
