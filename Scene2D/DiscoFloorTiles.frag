#version 330 core
/*****************************************************************************\
 *                              DiscoFloorTiles.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  DISCO FLOOR TILES: a lit dance floor seen from a low angle, glass tiles glowing from beneath, running away into
 *  a dark club with a mirror ceiling that repeats the floor overhead.
 *
 *  Every tile column is a spectrum band and each tile lights by how high that band reaches -- the floor is an
 *  equaliser you could dance on -- and the kick pulses the whole grid.  Haze hangs over it and catches the glow.
 *  Nothing moves but the light; the camera drifts very slowly along the floor.
 *
 *  Audio Reactivity:
 *    audioSpectrum[32] -> tile columns light up to the band's level (light)
 *    audioKick         -> a pulse through the whole floor (light)
 *    audioSwell        -> haze over the floor (slow)
 *    sceneAdvance      -> the slow drift along the floor (continuous)
 *
 *  Per-activation variety: patternP (equaliser or checker mix), hueP.
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

uniform float patternP; ///< Pattern knob: equaliser or checker mix, 0..1.
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

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  HSV to RGB.
 *
 * @param h  Hue, 0..1. (in)
 * @param s  Saturation, 0..1. (in)
 * @param v  Value, 0..1. (in)
 *
 * @return
 *   The RGB colour.
 **/
vec3 hsv( float h, float s, float v )
{
    vec3 k = clamp( abs( fract( h + vec3( 0.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ) - 1.0, 0.0, 1.0 );
    return v * mix( vec3( 1.0 ), k, s );
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

/** @{ */
float g_hue, g_pat, g_drift; ///< g_hue: Hue of the palette this frame (from hueP); g_pat: Pattern mix of the floor this
                             ///< frame, 0..1; g_drift: Drift of the floor pattern this frame.
/** @} */

/**  Emission of the floor at world (x, z): tiles 1 m, grout between.
 *
 * @param w  Position on the floor (x, z) in metres. (in)
 *
 * @return
 *   The emission (RGB).
 **/
vec3 floorGlow( vec2 w )
{
    vec2  ti = floor( w ), tf = fract( w );
    float grout = smoothstep( 0.0, 0.06, min( min( tf.x, 1.0 - tf.x ), min( tf.y, 1.0 - tf.y ) ) );
    // Equaliser: the column (x) picks the band, the row counted from the
    // camera end (z) is the level the band must reach.
    float col_idx = mod( ti.x + 16.0, 32.0 );
    int   band = int( col_idx );
    float e = clamp( audioSpectrum[band] * 1.5, 0.0, 1.0 );
    float row = mod( ti.y, 8.0 );
    float eq = smoothstep( row / 8.0 - 0.05, row / 8.0 + 0.05, e );
    float chk = mod( ti.x + ti.y, 2.0 ) * ( 0.35 + 0.65 * noise2( vec2( ti.x * 0.3, ti.y * 0.3 + sceneTime * 0.2 ) ) );
    float on = mix( eq, chk, g_pat * 0.6 ) * 0.6 + 0.4;
    // Tile colour: a disco floor is gel colours by nature (documented
    // rainbow identity, V8b) -- a hue per column group, nudged by the
    // photo's key so each activation has its own colour scheme.
    vec3  photo_c = imgPalette( g_hue * 0.159 + 0.2 );
    float h = g_hue * 0.159 + mod( ti.x, 6.0 ) / 6.0 + dot( photo_c, vec3( 0.1 ) );
    vec3  c = hsv( h, 0.85, 1.0 );
    // Diffuser: brighter in the middle of each tile.
    float diff = 0.7 + 0.3 * ( 1.0 - length( tf - 0.5 ) * 1.4 );
    float kick = clamp( audioKick, 0.0, 2.0 );
    return c * on * grout * diff * ( 0.9 + 0.5 * kick );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );
    g_hue = ( hueP > 0.001 ) ? hueP : 0.0;
    g_pat = clamp( patternP, 0.0, 1.0 );
    g_drift = sceneAdvance * 0.12 + sceneTime * 0.05;
    float swell = clamp( audioSwell, 0.0, 1.0 );

    vec3        ro = vec3( 0.3, 1.6, g_drift );
    vec3        rd = normalize( vec3( p.x, p.y - 0.46, 1.0 ) );
    const float Ceil = 3.4;

    vec3  col = vec3( 0.0 );
    float t_hit = 40.0;
    if ( rd.y < 0.0 )
    {
        float t = -ro.y / rd.y;
        vec3  w = ro + rd * t;
        col = floorGlow( w.xz ) * exp( -t * 0.06 );
        // Glass sheen: the room's darkness reflected, faint highlight.
        col += vec3( 0.02 ) * pow( 1.0 + rd.y, 8.0 );
        t_hit = t;
    }
    else
    {
        // Mirror ceiling: the floor seen again overhead, darker.
        float t = ( Ceil - ro.y ) / rd.y;
        vec3  w = ro + rd * t;
        float t2 = t + Ceil / rd.y; // ray continues down to the floor image
        vec3  w2 = ro + rd * t2;
        col = floorGlow( vec2( w2.x, w2.z ) ) * 0.6 * exp( -t2 * 0.05 );
        vec2 pan = fract( w.xz * 0.5 );
        col *= smoothstep( 0.0, 0.03, min( min( pan.x, 1.0 - pan.x ), min( pan.y, 1.0 - pan.y ) ) );
        t_hit = t;
    }

    // Haze: the glow of the floor hanging in the air above it.
    vec3  haze_c = floorGlow( vec2( ro.x + rd.x * 6.0, ro.z + 6.0 ) ) * 0.0;
    float hz = 0.0;
    for ( int i = 0; i < 10; ++i )
    {
        float tt = ( float( i ) + 0.5 ) / 10.0 * min( t_hit, 18.0 );
        vec3  x = ro + rd * tt;
        float h = exp( -x.y * 1.6 );
        vec3  below = floorGlow( x.xz );
        haze_c += below * h * 0.1;
        hz += h * 0.1;
    }
    col += haze_c * ( 0.25 + 0.5 * swell ) * 0.6;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
