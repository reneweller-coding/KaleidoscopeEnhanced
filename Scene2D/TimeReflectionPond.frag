#version 330 core
/*****************************************************************************\
 *                              TimeReflectionPond.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TIME REFLECTION POND: ripples on a pond, seen from above through the water to the photo on the pond floor -- and
 *  a time reflection: when the medium changes abruptly in time (the drop), every wave reverses, its outgoing rings
 *  running back to their sources.
 *
 *  The reversal is a smooth change of the phase velocity sign over the drop envelope (the waves slow, stop, run
 *  back), so it is continuous; the drop is the one cut the rules allow.  Sources ring on the scene clock; the swell
 *  is the wave amplitude; the treble the glints.  Camera still.
 *
 *  Audio Reactivity:
 *    sceneAdvance -> wave propagation (continuous)
 *    audioDrop    -> time reversal (the drop)
 *    audioSwell   -> amplitude (slow)
 *    audioHigh    -> glints (light)
 *    audioLevel   -> brightness
 *
 *  Per-activation variety: sourcesP, wavelenP, hueP.
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
uniform float audioDrop;      ///< Drop envelope: high after a detected drop, decaying.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float sourcesP; ///< Sources knob, 0..1.
uniform float wavelenP; ///< Wavelen knob, 0..1.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    int   n_src = 3 + int( clamp( sourcesP, 0.0, 1.0 ) * 4.0 );
    float k = 40.0 + 40.0 * ( 1.0 - clamp( wavelenP, 0.0, 1.0 ) );
    float amp = 0.004 + 0.012 * clamp( audioSwell, 0.0, 1.0 );
    float drop = clamp( audioDrop, 0.0, 1.0 );
    // Time reflection: the wave time runs forward normally; during the drop
    // envelope the direction crosses smoothly to backward and returns.
    // We integrate nothing: the wave phase uses an effective time built
    // from the clock and a reversal term that is a smooth pulse.
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;
    float reversal = sin( clamp( drop, 0.0, 1.0 ) * 3.14159 ); // 0 -> 1 -> 0 over the drop
    float t_eff = clock - reversal * 2.2;                      // the waves run back while it rises

    // Height field: rings from sources, each with its own age since its
    // last ring (periodic on the clock), damped with distance.
    float h = 0.0;
    vec2  grad = vec2( 0.0 );
    for ( int i = 0; i < 7; ++i )
    {
        if ( i >= n_src )
            break;
        float fi = float( i );
        vec2  c = vec2( ( hash11( fi * 3.7 ) - 0.5 ) * aspect * 0.9, ( hash11( fi * 5.3 ) - 0.5 ) * 0.9 );
        float d = length( p - c );
        float phase = d * k - t_eff * 6.0 + hash11( fi * 7.1 ) * 6.28;
        float env = exp( -d * 1.8 );
        float w = sin( phase ) * env;
        h += w * amp;
        grad += ( p - c ) / max( d, 1e-3 ) * cos( phase ) * env * k * amp;
    }
    // Refraction: look through the surface to the floor (the photo).
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 refr = uv - grad * 0.5;
    vec3 floor_col = img( clamp( refr, 0.0, 1.0 ) );
    floor_col = mix( floor_col, floor_col * imgPalette( hue * 0.159 + 0.55 ) * 1.5, 0.25 );
    // Water tint and depth.
    vec3 water = mix( vec3( 0.1, 0.3, 0.35 ), imgPalette( hue * 0.159 + 0.6 ), 0.3 );
    vec3 col = mix( floor_col, water, 0.25 );
    // Sky reflection along the slope, glints on the treble.
    float slope = length( grad );
    float glint = pow( clamp( slope * 8.0, 0.0, 1.0 ), 3.0 );
    col += vec3( 0.9, 0.95, 1.0 ) * glint * ( 0.2 + 0.8 * clamp( audioHigh * 2.0, 0.0, 1.0 ) );
    // Caustics: the floor brightens where the surface focuses light.
    col += floor_col * clamp( -h * 40.0, 0.0, 1.0 ) * 0.5;
    // The reversal tints the whole pond for its moment.
    col = mix( col, col * imgPalette( hue * 0.159 + 0.9 ) * 1.6, reversal * 0.35 );
    // The sources: round pebbles where the rings begin.
    for ( int i = 0; i < 7; ++i )
    {
        if ( i >= n_src )
            break;
        float fi = float( i );
        vec2  c = vec2( ( hash11( fi * 3.7 ) - 0.5 ) * aspect * 0.9, ( hash11( fi * 5.3 ) - 0.5 ) * 0.9 );
        col = mix( col, vec3( 0.2, 0.18, 0.15 ), smoothstep( 0.014, 0.008, length( p - c ) ) );
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
