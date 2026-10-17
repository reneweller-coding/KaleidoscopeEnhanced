#version 330 core
/*****************************************************************************\
 *                              NebulaCliffs.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  NEBULA CLIFFS: the "cosmic cliffs" of a star-forming region, as the infrared telescopes show them -- a wall of
 *  orange-brown dust rising from the bottom of the frame in three ranges, its crags lit gold along the ionisation
 *  front where the young cluster above (off frame) burns into it, steam-like wisps boiling off the edges, and above
 *  it all a glowing blue-cyan cavity of hot gas strewn with stars, the brightest wearing six-pointed diffraction
 *  spikes.
 *
 *  The ranges drift past at their own depths (slow parallax); the music is the light.
 *
 *    sceneTime/sceneAdvance -> the drift of the ranges, the wisps (continuous)
 *    audioSwell    -> the backlight: cavity glow and rim brightness (slow)
 *    audioKick     -> protostars embedded in the dust glow up (light only)
 *    audioChromaHue-> photo tint of gas and dust
 *
 *  Per-activation variety:
 *    dustP float height and density of the cliffs (0.5..1.5)
 *    glowP float brightness of the ionisation front (0.5..2.0)
 *    hueP float palette offset (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float dustP; ///< Dust knob: height and density of the cliffs (0.5..1.5).
uniform float glowP; ///< Glow / afterglow knob, 0..1.
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
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 1.9;
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
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 4.7;
        a *= 0.5;
    }
    return v;
}

/**  Stars: round points in cells; the brightest get six diffraction spikes.
 *
 * @param p        The point. (in)
 * @param scale    Cells per unit. (in)
 * @param density  Share of cells with a star. (in)
 * @param spikes   Strength of the diffraction spikes. (in)
 *
 * @return
 *   The star colour (RGB).
 **/
vec3 stars( vec2 p, float scale, float density, float spikes )
{
    vec2 g = p * scale;
    vec2 gi = floor( g ), gf = fract( g );
    vec3 c = vec3( 0.0 );
    for ( int j = -1; j <= 1; ++j )
        for ( int i = -1; i <= 1; ++i )
        {
            vec2  o = vec2( i, j );
            vec2  id = gi + o;
            float h = hash21( id );
            if ( h < 1.0 - density )
                continue;
            vec2  sp = o + 0.2 + 0.6 * vec2( hash21( id + 3.1 ), hash21( id + 5.7 ) );
            vec2  d = ( gf - sp ) / scale;
            float r = length( d );
            float b = ( h - ( 1.0 - density ) ) / density;
            vec3  sc = mix( vec3( 1.0, 0.85, 0.7 ), vec3( 0.75, 0.85, 1.0 ), hash21( id + 9.2 ) );
            c += sc * ( exp( -r * r * 9.0e5 ) * ( 0.6 + 1.6 * b ) + exp( -r * 180.0 ) * 0.05 * b );
            if ( spikes > 0.0 && b > 0.85 )
            {
                float sk = 0.0;
                for ( int k = 0; k < 3; ++k )
                {
                    float a = float( k ) * 1.0471976 + 0.5236;
                    vec2  ax = vec2( cos( a ), sin( a ) );
                    float along = abs( dot( d, ax ) ), across = abs( dot( d, vec2( -ax.y, ax.x ) ) );
                    sk += exp( -across * 2500.0 ) * exp( -along * 22.0 );
                }
                c += sc * sk * spikes * ( b - 0.85 ) * 6.0;
            }
        }
    return c;
}

/**  Edge profile of range L at x: towering crags and spires.
 *
 * @param x   Horizontal position. (in)
 * @param fl  The range (as a float). (in)
 * @param dp  Depth knob of the crags. (in)
 *
 * @return
 *   The edge height.
 **/
float edgeAt( float x, float fl, float dp )
{
    float base = -0.08 - 0.17 * fl + 0.1 * ( dp - 1.0 );
    float r = ridged( vec2( x * 1.1, fl * 5.0 ) );
    float spire = pow( smoothstep( 0.55, 0.95, noise2( vec2( x * 2.3, fl * 9.0 ) ) ), 2.0 );
    return base + 0.42 * dp * ( r - 0.3 ) + 0.3 * dp * spire * ( 1.0 - 0.3 * fl )
           + 0.05 * fbm( vec2( x * 6.0, fl * 3.0 ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );
    float dp = ( dustP > 0.01 ) ? dustP : 1.0;
    float gp = ( glowP > 0.01 ) ? glowP : 1.0;
    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float T = sceneTime + sceneAdvance * 0.5;

    // The cavity: hot blue-cyan gas, brightest toward the cluster above.
    vec2  gq = p * 1.6 + vec2( T * 0.004, 0.0 );
    float gas = fbm( gq + 0.4 * vec2( fbm( gq * 1.7 + 3.0 ), fbm( gq * 1.7 + 8.0 ) ) );
    vec3  cavity = mix( vec3( 0.04, 0.1, 0.28 ), vec3( 0.35, 0.75, 1.0 ), smoothstep( 0.3, 0.8, gas ) );
    cavity = mix( cavity, imgPalette( 0.55 + hue * 0.159 ) * 0.8, 0.15 );
    float toward = exp( -length( p - vec2( 0.35, 0.75 ) ) * 1.6 );
    vec3  col = cavity * ( 0.5 + 1.4 * toward ) * ( 0.8 + 0.4 * swell );
    col += vec3( 0.9, 0.95, 1.0 ) * toward * 0.25 * ( 0.8 + 0.4 * swell );
    col += stars( p + vec2( T * 0.002, 0.0 ), 22.0, 0.08, 1.0 );
    col += stars( p + vec2( T * 0.001, 0.0 ), 55.0, 0.05, 0.0 ) * 0.6;

    // Three ranges of dust, far to near.  Each: an edge profile with crags,
    // a wispy boundary, a lit rim and a dark, textured interior.
    vec3 dust_far = vec3( 0.45, 0.28, 0.2 );
    vec3 dust_near = vec3( 0.35, 0.18, 0.09 );
    vec3 rim_c = mix( vec3( 1.0, 0.72, 0.35 ), imgPalette( 0.1 + hue * 0.159 ), 0.2 );
    for ( int L = 0; L < 3; ++L )
    {
        float fl = float( L );
        float speed = 0.004 + 0.006 * fl;
        vec2  q = p * ( 1.0 + 0.35 * fl ) + vec2( T * speed + fl * 7.3, 0.0 );
        float edge = edgeAt( q.x, fl, dp );
        float slope = ( edgeAt( q.x + 0.03, fl, dp ) - edgeAt( q.x - 0.03, fl, dp ) ) / 0.06 * ( 1.0 + 0.35 * fl );
        float cos_s = inversesqrt( 1.0 + slope * slope ); // vertical -> true distance to the edge
        // Wispy boundary: the edge is warped by fine noise.
        float warp = ( fbm( q * 9.0 + vec2( 0.0, -T * 0.01 ) ) - 0.5 ) * 0.05;
        float d = p.y - edge + warp; // > 0 above the edge
        // Wisps boiling off the rim.
        float wisp = exp( -max( d, 0.0 ) * cos_s * 11.0 )
                     * smoothstep( 0.35, 0.8, fbm( vec2( q.x * 7.0, q.y * 2.0 - T * 0.02 ) ) );
        col += rim_c * wisp * step( 0.0, d ) * 0.35 * gp * ( 0.7 + 0.5 * swell ) * ( 1.0 - 0.3 * fl );
        if ( d < 0.0 )
        {
            float depth = -d * cos_s;
            float tex = fbm( q * 5.0 + 11.0 * fl );
            float crag = ridged( q * 8.0 + 3.0 * fl );
            vec3  dust = mix( dust_far, dust_near, fl / 2.0 ) * ( 0.35 + 0.6 * tex );
            dust = mix( dust, dust * imgPalette( 0.08 + hue * 0.159 ) * 1.6, 0.15 );
            // The ionisation front: a bright rim fading into the dust.
            float rim = exp( -depth * ( 22.0 - 5.0 * fl ) ) * ( 0.5 + 0.9 * crag );
            // Billows lit from above: an emboss of the cloud texture toward
            // the cluster, so the dust reads as heaped, sunlit cloud.
            vec2  bq = q * 4.0 + vec2( 0.0, fl * 3.0 );
            float b0 = fbm( bq ), b1 = fbm( bq - vec2( 0.02, 0.06 ) );
            float lit = clamp( ( b0 - b1 ) * 9.0 + 0.2, 0.0, 1.0 ) * exp( -depth * 3.5 );
            vec3  c = dust * ( 0.16 + 0.2 * crag * exp( -depth * 6.0 ) )
                      + rim_c * lit * 0.45 * gp * ( 0.75 + 0.5 * swell );
            // Nearer ranges veil less haze; farther ones pick up blue.
            c = mix( c, cavity * 0.5, 0.25 * ( 2.0 - fl ) / 2.0 );
            // Protostars shining red through the dust.
            vec2  sg = q * 9.0;
            vec2  si = floor( sg ), sf = fract( sg ) - 0.5;
            float ps = step( 0.95, hash21( si + fl * 17.0 ) ) * exp( -dot( sf, sf ) * 160.0 )
                       * smoothstep( 0.02, 0.1, depth );
            c += vec3( 1.0, 0.35, 0.2 ) * ps * ( 0.4 + 1.0 * clamp( audioKick, 0.0, 1.0 ) );
            // Soft, semi-transparent boundary: nebular dust has no hard edge.
            col = mix( col, c, smoothstep( 0.0, 0.035, depth ) );
            col += rim_c * rim * 1.6 * gp * ( 0.75 + 0.5 * swell );
        }
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
