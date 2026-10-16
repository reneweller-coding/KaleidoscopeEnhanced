#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file BookPagesTunnel.frag
 * @brief BOOK PAGES TUNNEL: a tunnel whose walls are the pages of a book,
 * turning as we pass.  Each page is a leaf hinged on the tunnel's spine
 * that turns steadily on the scene clock (which runs with the music's
 * energy, never with a beat tracker, so a resync can never jolt the
 * leaves), carrying the photo on one side and its palette negative on the
 * other.  The flight down the spine is steady; the kick lights the edges.
 *
 * Audio Reactivity:
 *   sceneAdvance  -> page angle and flight along the spine (continuous)
 *   audioKick     -> page edges flash (light)
 *   audioSwell    -> reading light (slow)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: pagesP (pages per unit), sizeP, hueP.
 */
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float pagesP;
uniform float sizeP; ///< Size knob, 0..1.
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

/**  Intersect a ray with a rectangular page: a quad in the plane through the spine (the x axis at height 0, running
 * along z) tilted by angle `ang`.
 *
 * @param ro   Ray origin. (in)
 * @param rd   Ray direction. (in)
 * @param zc   Position of the page's spine along z. (in)
 * @param ang  Tilt of the page (radians). (in)
 * @param w    Half width of the page. (in)
 * @param h    Height of the page. (in)
 *
 * @return
 *   The ray parameter t (x) and the uv on the page (yz), or t < 0.
 *
 * Returns t, and uv on the page, or t < 0.
 **/
vec3 hitPage( vec3 ro, vec3 rd, float zc, float ang, float w, float h )
{
    // Page plane: contains the spine line (y = 0, z = zc) along x, rotated
    // about that line by ang; the page extends from the spine outward (v in
    // 0..h along the rotated direction) and along x in -w..w.
    vec3  dir_up = vec3( 0.0, cos( ang ), sin( ang ) );
    vec3  n = vec3( 0.0, -sin( ang ), cos( ang ) );
    vec3  o = vec3( 0.0, 0.0, zc );
    float denom = dot( rd, n );
    if ( abs( denom ) < 1e-4 )
        return vec3( -1.0 );
    float t = dot( o - ro, n ) / denom;
    if ( t < 0.0 )
        return vec3( -1.0 );
    vec3  hp = ro + rd * t;
    float u = hp.x;
    float v = dot( hp - o, dir_up );
    if ( abs( u ) > w || v < 0.0 || v > h )
        return vec3( -1.0 );
    return vec3( t, u / w * 0.5 + 0.5, v / h );
}

/**  Shade one page hit: the photo on the front, its palette negative on the back, a reading light from above, a
 * kick-lit edge, faint text lines.
 *
 * @param best     The hit: t (x) and the uv (yz). (in)
 * @param bestAng  Tilt of the hit page (radians). (in)
 * @param rd       Ray direction. (in)
 * @param hue      Hue of the light. (in)
 *
 * @return
 *   The page colour (RGB).
 **/
vec3 shadePage( vec3 best, float bestAng, vec3 rd, float hue )
{
    vec3  n = vec3( 0.0, -sin( bestAng ), cos( bestAng ) );
    float face = step( 0.0, -dot( rd, n ) );
    vec2  uv = best.yz;
    vec3  photo = img( vec2( uv.x, 1.0 - uv.y ) );
    vec3  pal = imgPalette( hue * 0.159 + 0.5 );
    vec3  back = mix( ( 1.0 - photo ) * pal * 1.3, pal, 0.4 ) * 1.5 + 0.12;
    vec3  col = mix( back, photo * 1.4 + imgPalette( hue * 0.159 + 0.3 ) * 0.15 + 0.08, face );
    float lit = 0.65 + 0.35 * abs( n.y );
    col *= lit * ( 0.7 + 0.5 * audioLevel ) * ( 0.85 + 0.35 * clamp( audioSwell, 0.0, 1.0 ) );
    vec2  e = min( uv, 1.0 - uv );
    float edge = exp( -min( e.x, e.y ) * 40.0 );
    col += imgPalette( hue * 0.159 + 0.9 ) * edge * ( 0.3 + 1.0 * audioKick );
    col *= 0.9 + 0.1 * pow( 0.5 + 0.5 * sin( uv.y * 120.0 ), 8.0 );
    float fog = 1.0 - exp( -best.x * 0.12 );
    return mix( col, imgPalette( hue * 0.159 + 0.6 ) * 0.25, clamp( fog, 0.0, 0.85 ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float spacing = 1.0 / ( 2.0 + 2.0 * clamp( pagesP, 0.0, 1.0 ) );
    float pw = 1.1 * ( sizeP > 0.05 ? sizeP : 1.0 ), ph = 0.9 * ( sizeP > 0.05 ? sizeP : 1.0 );
    float travel = sceneAdvance * 1.2 + sceneTime * 0.25;

    // Camera slightly above the spine, looking down the book.
    vec3 ro = vec3( 0.0, 0.35, 0.0 );
    vec3 rd = normalize( vec3( p.x, p.y - 0.1, 1.3 ) );

    // Pages ahead of the camera, each at its own angle: the scene clock
    // turns all of them steadily, each offset by its index so the tunnel is
    // a spiral of leaves.  Two hits are kept: the nearest page of all, and
    // the nearest page that is still well ahead (zc >= 0.7).  A page that
    // has come close fades out over the one behind it, so it never fills
    // the frame with one dim close-up and never pops away.
    float near_t = 1e9;
    vec3  near_h = vec3( -1.0 );
    float near_ang = 0.0;
    float near_z = 0.0;
    float far_t = 1e9;
    vec3  far_h = vec3( -1.0 );
    float far_ang = 0.0;
    float far_z = 0.0;
    float k0 = floor( travel / spacing );
    for ( int k = 0; k < 28; ++k )
    {
        float idx = k0 + float( k );
        float zc = idx * spacing - travel;
        if ( zc < 0.02 )
            continue;
        float ang = sceneAdvance * 1.1 + sceneTime * 0.2 + idx * 0.45 + hash11( idx * 3.1 ) * 0.3;
        vec3  h = hitPage( ro, rd, zc, ang, pw, ph );
        if ( h.x <= 0.0 )
            continue;
        if ( h.x < near_t )
        {
            near_t = h.x;
            near_h = h;
            near_ang = ang;
            near_z = zc;
        }
        if ( zc >= 0.7 && h.x < far_t )
        {
            far_t = h.x;
            far_h = h;
            far_ang = ang;
            far_z = zc;
        }
    }

    // Between the pages: the book's far end -- the photo as an open spread,
    // dim, so no frame is ever black.
    vec2 fuv = fract( vec2( p.x * 0.4 + 0.5 + sceneAdvance * 0.005, p.y * 0.6 + 0.5 ) );
    vec3 bg = img( fuv ) * ( imgPalette( hue * 0.159 + 0.6 ) * 0.8 + 0.25 )
              + imgPalette( hue * 0.159 + 0.1 ) * exp( -length( p - vec2( 0.0, 0.1 ) ) * 3.0 ) * 0.5;

    vec3 col = bg;
    if ( far_h.x > 0.0 )
        col = shadePage( far_h, far_ang, rd, hue );
    if ( near_h.x > 0.0 && near_z < 0.7 )
    {
        vec3 nc = shadePage( near_h, near_ang, rd, hue );
        col = mix( col, nc, smoothstep( 0.15, 0.6, near_z ) );
    }

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
