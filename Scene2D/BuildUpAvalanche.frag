#version 330 core
/*****************************************************************************\
 *                              BuildUpAvalanche.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  BUILD-UP AVALANCHE: a great alpine peak under a deep blue sky -- its left face in sun, ribbed with rock and
 *  couloirs, the right in blue shade, a pale range behind, spruce along the valley floor.
 *
 *  As the music builds, the snow loads the face (the rock disappears under it), the cornice grows and a banner of
 *  spindrift streams off the summit; at the drop the slab releases and a powder avalanche billows down the sunny
 *  face, widening as it runs, and settles away.  The drop is the one allowed cut, and it moves the snow, not the
 *  camera, which is fixed on the peak.
 *
 *  Audio Reactivity:
 *    audioBuildUp -> snow load and cornice (slow)
 *    audioDrop    -> the release (the drop: the avalanche runs)
 *    sceneAdvance -> the run itself and the powder drift (continuous)
 *    audioBass    -> the rumble as light in the powder (light)
 *    audioLevel   -> brightness
 *
 *  Per-activation variety: slopeP, grainP, hueP.
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
uniform float audioBuildUp;   ///< Build-up toward a drop, 0..1.
uniform float audioDrop;      ///< Drop envelope: high after a detected drop, decaying.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float slopeP; ///< Slope knob, 0..1.
uniform float grainP; ///< Grain knob, 0..1.
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
    for ( int i = 0; i < 5; ++i )
    {
        v += a * noise2( p );
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 5.0;
        a *= 0.5;
    }
    return v;
}
/**  Ridged fractal noise (four octaves).
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, about 0..1.
 **/
float ridged( vec2 p )
{
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        float n = 1.0 - abs( 2.0 * noise2( p ) - 1.0 );
        v += a * n * n;
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 3.3;
        a *= 0.5;
    }
    return v;
}

/**  The skyline: the main peak and two shoulder peaks.
 *
 * @param x      Horizontal position. (in)
 * @param px     Position of the main peak. (in)
 * @param peakY  Height of the main peak. (in)
 * @param slope  Slope of the flanks. (in)
 *
 * @return
 *   The skyline's height.
 **/
float profileAt( float x, float px, float peakY, float slope )
{
    float prof = peakY - abs( x - px ) * slope * ( x < px ? 0.9 : 1.1 )
                 + 0.06 * ( ridged( vec2( x * 4.0, 2.0 ) ) - 0.5 );
    prof = max( prof, 0.22 - abs( x + 0.45 ) * slope * 1.2 + 0.04 * ( ridged( vec2( x * 6.0, 5.0 ) ) - 0.5 ) );
    prof = max( prof, 0.16 - abs( x - 0.72 ) * slope * 1.1 + 0.04 * ( ridged( vec2( x * 6.0, 8.0 ) ) - 0.5 ) );
    return prof;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float slope = 0.8 + 0.5 * clamp( slopeP, 0.0, 1.0 );
    float grain = 30.0 + 40.0 * clamp( grainP, 0.0, 1.0 );
    float build = clamp( audioBuildUp, 0.0, 1.0 );
    float drop = clamp( audioDrop, 0.0, 1.0 ); // 1 at the drop, decaying
    float T = sceneTime + sceneAdvance * 0.5;
    vec3  sun_dir = normalize( vec3( -0.6, 0.5, 0.6 ) );

    // Alpine sky: deep blue overhead, pale at the horizon, the sun's glow.
    vec3 col = mix( vec3( 0.75, 0.85, 0.95 ), vec3( 0.12, 0.3, 0.65 ), smoothstep( -0.1, 0.5, p.y ) );
    col = mix( col, imgPalette( 0.6 + hue * 0.159 ) * 0.9, 0.1 );
    col += vec3( 1.0, 0.95, 0.85 ) * exp( -length( p - vec2( -0.8, 0.45 ) ) * 3.0 ) * 0.35;

    // A far range, pale and hazy.
    float far = -0.02 + 0.16 * ridged( vec2( p.x * 1.8 + 3.0, 1.0 ) );
    if ( p.y < far )
    {
        vec3 fc = mix( vec3( 0.7, 0.78, 0.9 ), vec3( 0.55, 0.65, 0.8 ), smoothstep( 0.0, 0.1, far - p.y ) );
        fc *= 0.9 + 0.15 * ridged( vec2( p.x * 12.0, p.y * 3.0 ) );
        col = fc;
    }

    // The mountain: a big peak, its left face in sun, right face in shade.
    float px = 0.18;
    float peakY = 0.4;
    float prof = profileAt( p.x, px, peakY, slope );
    float on_face = step( p.y, prof );
    float snow_line = 0.0;
    if ( on_face > 0.0 )
    {
        float depth = prof - p.y;
        // Faces rising to the right look toward the sun (left); the line
        // wanders a little down the face.
        // Which peak owns this column, and its crest line running down and
        // slightly right from the summit: left of it is the sunny face.
        float m0 = peakY - abs( p.x - px ) * slope;
        float m1 = 0.22 - abs( p.x + 0.45 ) * slope * 1.2;
        float m2 = 0.16 - abs( p.x - 0.72 ) * slope * 1.1;
        float cxp = px, ctop = peakY;
        if ( m1 > m0 && m1 > m2 )
        {
            cxp = -0.45;
            ctop = 0.22;
        }
        else if ( m2 > m0 && m2 > m1 )
        {
            cxp = 0.72;
            ctop = 0.16;
        }
        float crest = cxp + ( ctop - p.y ) * 0.28 + 0.04 * ( fbm( vec2( p.y * 6.0, cxp * 3.0 ) ) - 0.5 );
        bool  sunny = p.x < crest;
        // Ribs and couloirs: ridged relief running down the face.
        float fall = ( p.x - px ) * ( sunny ? -1.0 : 1.0 );
        vec2  rq = vec2( p.x * 7.0 + p.y * 2.5 * ( sunny ? 1.0 : -1.0 ), p.y * 2.0 );
        float rib = ridged( rq );
        // Snow cover: more of the face is buried as the build-up loads it.
        float cover = smoothstep( 0.35 - 0.3 * build, 0.6 - 0.3 * build,
                                  rib * 0.6 + 0.5 * smoothstep( 0.0, 0.3, depth ) * 0.0 + 0.4 * fbm( p * 6.0 ) );
        cover = max( cover, 0.3 + 0.5 * build ) * ( 1.0 - 0.6 * smoothstep( 0.62, 0.75, rib ) );
        vec3  rock_c = mix( vec3( 0.25, 0.22, 0.2 ), vec3( 0.4, 0.36, 0.32 ), fbm( p * 20.0 ) );
        vec3  snow_c = vec3( 0.97, 0.98, 1.0 );
        float lit = sunny ? ( 0.8 + 0.3 * rib ) : ( 0.35 + 0.2 * rib );
        vec3  face = mix( rock_c, snow_c, clamp( cover, 0.0, 1.0 ) ) * lit;
        if ( !sunny )
            face *= vec3( 0.75, 0.85, 1.05 ); // blue shade
        // The cornice lip along the ridge line, growing with the build.
        face = mix( face, snow_c * 1.1, smoothstep( 0.02 + 0.03 * build, 0.0, depth ) * ( 0.4 + 0.6 * build ) );
        // Aerial haze toward the valley.
        face = mix( face, vec3( 0.75, 0.82, 0.92 ), smoothstep( -0.1, -0.5, p.y ) * 0.35 );
        col = face;
    }

    // Snow banner: spindrift streaming off the summit, stronger with the build.
    {
        vec2 bq = p - vec2( px, peakY );
        // Only downwind of the summit: upwind (bq.x < -1/3) the width term
        // below changes sign and the 0 * inf product painted a NaN column.
        float bx = max( bq.x, 0.0 );
        float plume = exp( -abs( bq.y - 0.05 * bq.x - 0.015 * sin( bq.x * 10.0 - T ) ) * 25.0 / ( 1.0 + bx * 3.0 ) )
                      * smoothstep( 0.0, 0.04, bq.x ) * exp( -bx * 2.0 ) * exp( -abs( bq.y ) * 5.0 );
        plume *= 0.4 + 0.7 * fbm( vec2( bq.x * 6.0 - T * 0.4, bq.y * 10.0 ) );
        col = mix( col, vec3( 1.0 ), clamp( plume * ( 0.6 + 1.0 * build ), 0.0, 0.9 ) );
    }

    // The avalanche: after the drop a powder cloud runs down the sunny face
    // from below the summit, billowing and widening, and settles away.
    float run = 1.0 - drop;
    float running = step( 0.02, drop ) * ( 1.0 - smoothstep( 0.75, 1.0, run ) );
    if ( running > 0.0 )
    {
        float start_y = peakY - 0.12;
        float front_y = start_y - run * 0.9;
        // The path runs down and out across the sunny face; the cloud
        // widens as it goes and billows most at its head.
        float x_path = px - 0.08 - ( start_y - p.y ) * 0.45;
        float across = abs( p.x - x_path );
        float w = 0.03 + 0.35 * clamp( start_y - p.y, 0.0, 1.0 ) * ( 0.5 + run );
        float body = smoothstep( w, w * 0.2, across )
                     * smoothstep( front_y - 0.06, front_y + 0.04, p.y )
                     * smoothstep( start_y + 0.03, start_y - 0.05, p.y );
        vec2  hq = p - vec2( px - 0.08 - ( start_y - front_y ) * 0.45, front_y + 0.02 );
        float head_r = 0.06 + 0.2 * run;
        float head = exp( -dot( hq, hq ) / ( head_r * head_r ) );
        float bill = fbm( p * 6.0 + vec2( 0.0, sceneAdvance * 0.6 ) ) * 0.6
                     + fbm( p * 14.0 - vec2( sceneAdvance * 0.3, 0.0 ) ) * 0.4;
        float cloud = clamp( ( body * 0.8 + head * 1.2 ) * smoothstep( 0.25, 0.7, bill + 0.3 * ( body + head ) ), 0.0,
                             1.0 )
                      * running;
        // Lit billows: brighter on the sun side.
        vec3 powder = mix( vec3( 0.55, 0.62, 0.75 ), vec3( 1.05 ), smoothstep( 0.3, 0.75, bill ) )
                      * ( 0.85 + 0.35 * clamp( audioBass, 0.0, 1.0 ) );
        col = mix( col, powder, cloud );
        // Round grains thrown ahead of the front.
        vec2  gu = ( p + vec2( 0.0, sceneAdvance * 0.2 ) ) * grain;
        vec2  cell = floor( gu );
        vec2  f = fract( gu ) - 0.5;
        vec2  off = vec2( hash21( cell + 3.1 ), hash21( cell + 7.7 ) ) - 0.5;
        float grains = smoothstep( 0.25, 0.05, length( f - off * 0.6 ) ) * step( 0.85, hash21( cell ) ) * head
                       * running;
        col += vec3( 1.0 ) * grains * 0.5;
    }

    // Foreground: a dark band of spruce along the bottom.
    {
        float tx = p.x * 18.0;
        float ti = floor( tx ), tf = fract( tx ) - 0.5;
        float th = 0.06 + 0.06 * hash21( vec2( ti, 3.0 ) );
        float base = -0.44 + 0.03 * fbm( vec2( p.x * 2.0, 7.0 ) );
        float tree = step( p.y, base + th * ( 1.0 - abs( tf ) * 2.2 ) ) + step( p.y, base );
        col = mix( col, vec3( 0.03, 0.07, 0.06 ), clamp( tree, 0.0, 1.0 ) );
    }

    // Wind-blown flakes as it builds: round.
    vec2  su = ( p - vec2( sceneAdvance * 0.3, -sceneAdvance * 0.1 ) ) * 50.0;
    vec2  sc = floor( su );
    vec2  sf = fract( su ) - 0.5;
    vec2  so = vec2( hash21( sc + 1.3 ), hash21( sc + 5.9 ) ) - 0.5;
    float flakes = smoothstep( 0.2, 0.05, length( sf - so * 0.6 ) ) * step( 0.97, hash21( sc ) ) * build;
    col += vec3( 1.0 ) * flakes * 0.6;
    col *= 0.8 + 0.4 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
