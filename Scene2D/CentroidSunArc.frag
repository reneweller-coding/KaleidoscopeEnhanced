#version 330 core
/*****************************************************************************\
 *                              CentroidSunArc.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  CENTROID SUN ARC: the timbre as the time of day.
 *
 *  The spectral centroid -- how bright the sound is -- is the height of the sun over a landscape of the photo:
 *  dark, bassy passages are dusk with long shadows and a red sun on the horizon, bright passages are noon; spectral
 *  flatness is the haze (noisy sound = hazy air); the centroid is slow enough on its own to move the sun smoothly.
 *  Round birds cross on the scene clock; the kick is a glint on the water.  Camera fixed.
 *
 *  Audio Reactivity:
 *    audioCentroid -> sun height and colour (slow)
 *    audioFlatness -> haze (slow)
 *    sceneAdvance  -> birds and cloud drift (continuous)
 *    audioKick     -> water glint (light)
 *    audioLevel    -> brightness
 *
 *  Per-activation variety: hillsP, lakeP, hueP.
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
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioFlatness;  ///< Spectral flatness: 0 tonal .. 1 noise-like.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float hillsP; ///< Hills knob, 0..1.
uniform float lakeP;  ///< Lake knob, 0..1.
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
    float hills = 2.0 + 2.0 * clamp( hillsP, 0.0, 1.0 );
    float lake_y = -0.22 - 0.1 * clamp( lakeP, 0.0, 1.0 );
    float day = clamp( audioCentroid, 0.0, 1.0 ); // 0 dusk .. 1 noon
    float haze = clamp( audioFlatness, 0.0, 1.0 );
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;
    // The sun: on an arc, height from the centroid; colour reddens low.
    float sun_a = mix( 0.05, 1.35, day );
    vec2  sun_pos = vec2( 0.55 - cos( sun_a ) * 0.7, -0.05 + sin( sun_a ) * 0.55 );
    vec3  sun_col = mix( vec3( 1.0, 0.35, 0.1 ), vec3( 1.0, 0.97, 0.9 ), smoothstep( 0.0, 0.5, day ) );

    // Sky: gradient from dusk purple/orange to noon blue, hazed.
    vec3 dusk_sky = mix( vec3( 0.35, 0.15, 0.3 ), vec3( 0.95, 0.5, 0.25 ), smoothstep( 0.5, -0.1, p.y ) );
    vec3 noon_sky = mix( vec3( 0.3, 0.55, 0.95 ), vec3( 0.75, 0.85, 1.0 ), smoothstep( 0.5, -0.1, p.y ) );
    vec3 sky = mix( dusk_sky, noon_sky, day );
    sky = mix( sky, sky * imgPalette( hue * 0.159 + 0.6 ) * 1.5, 0.15 );
    sky = mix( sky, vec3( 0.75, 0.75, 0.75 ) * ( 0.4 + 0.6 * day ), haze * 0.5 );
    float sd = length( ( p - sun_pos ) * vec2( 1.0, 1.0 ) );
    sky += sun_col * ( smoothstep( 0.045, 0.04, sd ) * 1.5 + exp( -sd * 4.0 ) * 0.8 * ( 0.5 + 0.5 * haze ) );
    // Clouds drifting.
    float cl = fbm( vec2( p.x * 1.5 - clock * 0.08, p.y * 3.0 ) + 2.0 );
    float cover = smoothstep( 0.5, 0.75, cl ) * step( -0.05, p.y );
    vec3  cloud_col = mix( sun_col * 0.7 + 0.3, vec3( 0.95 ), day ) * ( 0.6 + 0.4 * ( 1.0 - haze ) );
    sky = mix( sky, cloud_col, cover * 0.7 );
    vec3 col = sky;

    // Hills: layered ridges of the photo, lit by the sun, long shadows at dusk.
    for ( int i = 0; i < 4; ++i )
    {
        float fi = float( i );
        if ( fi >= hills )
            break;
        float depth = 1.0 - fi / hills;
        float ridge = -0.02 - fi * 0.08 + 0.12 * fbm( vec2( p.x * ( 1.5 + fi ) + fi * 7.0, 1.0 ) ) * depth;
        float m = step( p.y, ridge );
        vec3  hill = img( vec2( fract( p.x * 0.5 + fi * 0.2 ), clamp( ( p.y + 0.5 ) * 0.8, 0.0, 1.0 ) ) );
        hill = mix( hill, hill * imgPalette( hue * 0.159 + 0.3 + fi * 0.1 ) * 1.5, 0.3 );
        // Lighting: the sun-facing slope (the fbm slope sign) vs. the shadowed side.
        float slope = fbm( vec2( ( p.x + 0.01 ) * ( 1.5 + fi ) + fi * 7.0, 1.0 ) )
                      - fbm( vec2( ( p.x - 0.01 ) * ( 1.5 + fi ) + fi * 7.0, 1.0 ) );
        float facing = 0.5 + 0.5 * sign( slope ) * sign( sun_pos.x - p.x );
        float light = mix( 0.25, 1.0, facing ) * ( 0.3 + 0.7 * day ) + 0.1;
        hill *= light;
        hill = mix( hill, sun_col * 0.6, ( 1.0 - day ) * 0.3 * facing );
        hill = mix( hill, sky, depth * 0.45 * ( 0.5 + 0.5 * haze ) );
        col = mix( col, hill, m );
    }
    // The lake: mirrors the sky and the sun, glinting on the kick.
    if ( p.y < lake_y )
    {
        vec2  rp = vec2( p.x, 2.0 * lake_y - p.y );
        float rd = length( ( rp - sun_pos ) * vec2( 1.0, 1.0 ) );
        vec3  lake = mix( sky, vec3( 0.05, 0.1, 0.15 ), 0.4 );
        lake += sun_col * exp( -abs( p.x - sun_pos.x ) * 12.0 ) * ( 1.0 - smoothstep( 0.0, 0.35, lake_y - p.y ) ) * 0.6;
        float ripple = pow( 0.5 + 0.5 * sin( p.x * 60.0 + p.y * 80.0 + clock * 3.0 ), 6.0 );
        lake += sun_col * ripple * exp( -abs( p.x - sun_pos.x ) * 6.0 ) * ( 0.15 + 0.8 * audioKick );
        col = lake;
    }
    // Birds: round bodies crossing on the clock, high.
    for ( int k = 0; k < 5; ++k )
    {
        float fk = float( k );
        float ph = fract( clock * 0.15 * ( 0.7 + 0.4 * hash11( fk * 3.1 ) ) + hash11( fk * 5.3 ) );
        vec2  bp = vec2( ( ph - 0.5 ) * aspect * 1.2,
                         0.25 + 0.15 * hash11( fk * 7.7 ) + 0.02 * sin( clock * 4.0 + fk ) );
        float bird = smoothstep( 0.008, 0.004, length( p - bp ) );
        col = mix( col, vec3( 0.05 ), bird );
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
