#version 330 core
/*****************************************************************************\
 *                              RunwayApproachLights.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  RUNWAY APPROACH LIGHTS: final approach at night, seen from the cockpit -- ahead in the dark the runway lies as a
 *  converging frame of white edge lights, green threshold bar, the centre line of white lights running away to the
 *  far end, and in front of it the approach lighting system reaching toward us: rows of white crossbars on the
 *  extended centre line, and the "rabbit", the sequenced strobes, racing along them toward the runway again and
 *  again.
 *
 *  The city glows orange on the horizon; mist halos every light.  The aircraft descends steadily.
 *
 *  Audio Reactivity:
 *    audioKick   -> the rabbit's strobes (light)
 *    audioBass   -> the intensity of the approach lights (light)
 *    audioSwell  -> the mist around the lights (slow)
 *    audioLevel  -> brightness
 *    sceneTime / sceneAdvance -> the approach (constant, looping smoothly)
 *
 *  Per-activation variety: mistP (how misty), hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float mistP; ///< Mist knob: how misty, 0..1.
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
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
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

vec3 gCol; ///< The colour gathered so far for this pixel.
/** @{ */
float gMist, gPx; ///< gMist: Thickness of the mist this frame; gPx: Size of a pixel (1 / screen height).
/** @} */
vec3 gRo; ///< The camera position this frame.
/** @{ */
vec3 gFw, gRt, gUp; ///< gFw: The camera's forward axis; gRt: The camera's right axis; gUp: The camera's up axis.
/** @} */

/// The lens: 2.0 (was 1.2, from 900 m out the 45-m runway came out 64 pixels wide -- one line of lights).
const float Focal = 2.0;

/**  Add one light at world position P with colour c and intensity I.
 *
 * @param p  The screen point. (in)
 * @param P  World position of the light. (in)
 * @param c  Its colour. (in)
 * @param I  Its intensity. (in)
 **/
void light( vec2 p, vec3 P, vec3 c, float I )
{
    vec3  v = P - gRo;
    float z = dot( v, gFw );
    if ( z < 1.0 )
        return;
    vec2  s = vec2( dot( v, gRt ), dot( v, gUp ) ) / z * Focal;
    float d = length( p - s );
    // A lamp's glare, not its housing: 1.2 m (was 0.6, two pixels at 300 m), and a stronger halo in the mist.
    float r = max( 1.2 / z, gPx * 1.0 );
    float core = smoothstep( r + gPx, r * 0.3, d );
    float halo = exp( -d / ( r * 4.0 + 0.004 ) ) * gMist / ( 1.0 + z / 250.0 );
    gCol += c * I * ( core * 1.6 + halo * 0.9 ) * clamp( 60.0 / z, 0.3, 1.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );
    float kick = clamp( audioKick, 0.0, 1.0 );
    float bass = clamp( audioBass, 0.0, 1.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float T = sceneTime + sceneAdvance * 0.4;
    gPx = 1.0 / resolution.y;
    gMist = ( 0.4 + 0.6 * clamp( mistP, 0.0, 1.0 ) ) * ( 0.7 + 0.5 * swell );

    // The approach: a 3-degree glide, sliding forward and down; the run
    // repeats smoothly (fading at the loop).
    float cyc = 40.0;
    float u = fract( T / cyc );
    float dist = mix( 480.0, 60.0, u ); // metres to the threshold (was 900 .. 120: a line of lights)
    gRo = vec3( 3.0 * sin( T * 0.05 ), dist * 0.0524 + 3.0, -dist );
    gFw = normalize( vec3( 0.0, -0.06, 1.0 ) );
    gRt = normalize( cross( vec3( 0.0, 1.0, 0.0 ), gFw ) );
    gUp = cross( gFw, gRt );
    float loop_fade = smoothstep( 0.0, 0.06, u ) * smoothstep( 1.0, 0.94, u );

    // Night sky and the orange city glow on the horizon.
    float hz_y = 0.06 * Focal; // looking down, the horizon sits above centre
    gCol = mix( vec3( 0.03, 0.035, 0.06 ), vec3( 0.01, 0.012, 0.03 ), smoothstep( hz_y, 0.5, p.y ) );
    gCol += vec3( 0.4, 0.22, 0.1 ) * exp( -abs( p.y - hz_y ) * 14.0 ) * ( 0.5 + 0.5 * noise2( vec2( p.x * 3.0, 1.0 ) ) )
            * ( 0.6 + 0.4 * gMist );
    // The dark ground with scattered town lights far away.
    if ( p.y < hz_y )
    {
        // Scattered lights of the town: round points, smaller toward the horizon.
        float dh = hz_y - p.y;
        vec2  g = p * 160.0; // a fixed grid (no shear), dots shrink with distance
        vec2  gi = floor( g ), gf = fract( g );
        vec2  gc = 0.25 + 0.5 * vec2( hash21( gi + 1.0 ), hash21( gi + 2.0 ) );
        float rr = mix( 0.05, 0.16, smoothstep( 0.0, 0.4, dh ) );
        float tl = step( 1.0 - 0.1 * smoothstep( 0.35, 0.02, dh ), hash21( gi ) )
                   * smoothstep( rr, rr * 0.3, length( gf - gc ) ) * smoothstep( 0.0, 0.015, dh );
        gCol += mix( vec3( 1.0, 0.7, 0.35 ), vec3( 0.9, 0.95, 1.0 ), step( 0.7, hash21( gi + 3.0 ) ) ) * tl * 0.45;
    }

    float I = ( 0.7 + 0.5 * bass ) * loop_fade;
    vec3  white = vec3( 1.0, 0.95, 0.85 );
    // Runway: 3000 m long, 45 m wide; edge lights every 60 m, centre line every 30 m.
    for ( int i = 0; i < 50; ++i )
    {
        float z = float( i ) * 60.0;
        light( p, vec3( -22.5, 0.0, z ), white, I * 0.9 );
        light( p, vec3( 22.5, 0.0, z ), white, I * 0.9 );
    }
    for ( int i = 0; i < 60; ++i )
    {
        float z = float( i ) * 50.0 + 15.0;
        vec3  cc = ( z > 2100.0 ) ? ( ( mod( float( i ), 2.0 ) < 1.0 ) ? vec3( 1.0, 0.2, 0.15 ) : white ) : white;
        light( p, vec3( 0.0, 0.0, z ), cc, I * 0.6 );
    }
    // The threshold: a bar of green lights across the runway start.
    for ( int i = 0; i < 16; ++i )
        light( p, vec3( -22.5 + float( i ) * 3.0, 0.0, 0.0 ), vec3( 0.2, 1.0, 0.4 ), I );
    // Touchdown zone bars.
    for ( int r = 0; r < 6; ++r )
        for ( int k = 0; k < 3; ++k )
        {
            float z = 150.0 + float( r ) * 60.0;
            light( p, vec3( -11.0 - float( k ) * 1.5, 0.0, z ), white, I * 0.7 );
            light( p, vec3( 11.0 + float( k ) * 1.5, 0.0, z ), white, I * 0.7 );
        }
    // Approach lighting: centre-line bars every 30 m out to 900 m, a wide
    // crossbar at 300 m; the rabbit racing inward twice a second.
    float rabbit = fract( T * 2.0 );
    for ( int i = 1; i <= 30; ++i )
    {
        float z = -float( i ) * 30.0;
        for ( int k = -2; k <= 2; ++k )
            light( p, vec3( float( k ) * 1.0, 0.5, z ), white, I * 0.8 );
        if ( i == 10 )
            for ( int k = -7; k <= 7; ++k )
                light( p, vec3( float( k ) * 2.0, 0.5, z ), white, I * 0.8 );
        // Sequenced flasher on each bar: fires as the rabbit passes.
        float ph = float( 30 - i ) / 30.0;
        float fl = exp( -pow( ( rabbit - ph ) * 40.0, 2.0 ) );
        light( p, vec3( 0.0, 1.0, z ), vec3( 0.9, 0.95, 1.0 ), fl * ( 1.5 + 2.5 * kick ) * loop_fade );
    }
    // The windscreen frame: a thin dark border at the corners.
    vec3 col = gCol;
    col = mix( col, col * imgPalette( 0.1 + hueP * 0.159 ) * 1.3, 0.05 );
    float frame = smoothstep( 0.03, 0.0, 0.5 - abs( p.y ) ) + smoothstep( 0.08, 0.0, 0.5 * aspect - abs( p.x ) );
    col *= 1.0 - 0.8 * clamp( frame, 0.0, 1.0 );

    col *= 0.9 + 0.2 * audioLevel;
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
