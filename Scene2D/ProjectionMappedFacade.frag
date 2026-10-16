#version 330 core
/*****************************************************************************\
 *                              ProjectionMappedFacade.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PROJECTION MAPPED FACADE: a baroque palace front at night, a projection-mapping show playing on it.
 *
 *  Pilasters with capitals, heavy cornices, arched windows, a portal and a pediment -- and the photograph projected
 *  over all of it, broken by the relief: the cornices throw shadows, the window recesses swallow the light, the
 *  column shafts catch it.  The show moves through its acts: the photo on the stone, light running along the
 *  outlines of the architecture, a glowing sweep that passes over the front.  A crowd stands in the dark square.
 *  The facade and the camera are still; the show is light.
 *
 *  Audio Reactivity:
 *    audioKick   -> the outlines flash (light)
 *    audioBass   -> the projector's brightness (light)
 *    audioSwell  -> the sweep (slow)
 *    audioLevel  -> brightness
 *    sceneTime / sceneAdvance -> the acts of the show, the running light
 *
 *  Per-activation variety: bayP (how many window bays), hueP.
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

uniform float bayP; ///< Bay knob: how many window bays, 0..1.
uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
/**  Signed distance to a box of half size b.
 *
 * @param p  The point. (in)
 * @param b  Half size of the box. (in)
 *
 * @return
 *   The signed distance.
 **/
float sdBox( vec2 p, vec2 b )
{
    vec2 d = abs( p ) - b;
    return length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 );
}

const float Ground = -0.36; ///< Height of the ground (world units).
const float Entab = 0.2;    ///< the main entablature
const float Top = 0.37;     ///< tip of the pediment
float       gBay;           ///< bay width
float       gHalfW;         ///< half width of the facade

/**  A soft raised band (a cornice or a moulding) of height a and half width w.
 *
 * @param d  Distance from the band's centre line. (in)
 * @param w  Half width. (in)
 * @param a  Height of the band. (in)
 *
 * @return
 *   The band's height.
 **/
float band( float d, float w, float a )
{
    return a * smoothstep( w, w * 0.4, abs( d ) );
}

/**  The relief of the facade (height toward the viewer) and a glass mask.
 *
 * @param p      The point. (in)
 * @param glass  Receives 1 on a window. (out)
 *
 * @return
 *   The height toward the viewer (-1 outside the facade).
 **/
float relief( vec2 p, out float glass )
{
    glass = 0.0;
    if ( abs( p.x ) > gHalfW || p.y < Ground )
        return -1.0;
    float h = 0.0;
    // Rustication: grooves on the ground floor.
    if ( p.y < -0.12 )
        h -= 0.004 * smoothstep( 0.002, 0.0, abs( fract( ( p.y - Ground ) / 0.03 ) - 0.5 ) * 0.03 - 0.013 );
    // Pediment above the entablature in the middle, attic balustrade to the sides.
    if ( p.y > Entab + 0.03 )
    {
        float slope = Top - ( Top - Entab - 0.03 ) * abs( p.x ) / 0.36;
        if ( abs( p.x ) < 0.36 && p.y < slope )
        {
            float frame = min( abs( p.y - ( Entab + 0.035 ) ), ( slope - p.y ) * 0.95 );
            h = 0.012 + band( frame, 0.012, 0.02 ) - 0.008 * step( 0.014, frame );
            // A round window (oculus) in the tympanum.
            float oc = length( p - vec2( 0.0, Entab + 0.075 ) ) - 0.03;
            h += band( oc, 0.008, 0.012 ) - 0.02 * step( oc, -0.004 );
            glass = step( oc, -0.006 );
        }
        else if ( p.y < Entab + 0.1 )
        {
            // Balustrade: little bulging balusters between a rail and a plinth.
            float bx = fract( p.x / 0.018 ) - 0.5;
            float by = ( p.y - Entab - 0.03 ) / 0.07;
            float bal = step( abs( bx ), 0.25 + 0.12 * sin( by * 3.14159 ) ) * step( 0.15, by ) * step( by, 0.85 );
            h = 0.004 + 0.01 * bal + band( by - 0.93, 0.07, 0.012 ) + band( by - 0.07, 0.07, 0.01 );
            glass = -1.0 * ( 1.0 - bal ) * step( 0.15, by ) * step( by, 0.85 ); // sky between the balusters
        }
        else
        {
            return -1.0;
        }
        return h;
    }
    // Entablature and the storey cornice.
    h += band( p.y - Entab, 0.028, 0.03 ) + band( p.y - Entab - 0.02, 0.01, 0.012 );
    h += band( p.y + 0.12, 0.014, 0.02 );
    h += band( p.y - Ground - 0.012, 0.012, 0.012 ); // plinth
    // Pilasters between the bays, with capitals and bases.
    float px = ( fract( p.x / gBay ) - 0.5 ) * gBay; // pilasters on the bay edges
    if ( p.y < Entab - 0.02 )
    {
        float cap = smoothstep( Entab - 0.06, Entab - 0.03, p.y );
        float pw = 0.018 + 0.008 * cap;
        float pil = smoothstep( pw + 0.002, pw - 0.002, abs( px ) ) * step( -0.105, p.y );
        // Fluting on the shafts.
        float flute = 0.003 * ( 0.5 + 0.5 * cos( px / pw * 3.14159 * 3.0 ) ) * ( 1.0 - cap );
        h += pil * ( 0.018 + flute + 0.008 * cap );
    }
    // Windows: arched openings in each bay, both storeys; the portal in the middle.
    float bay_i = floor( p.x / gBay + 0.5 );
    float wx = p.x - bay_i * gBay;
    vec2  wq = vec2( wx, p.y );
    float w_up, w_dn;
    {
        vec2  q = wq - vec2( 0.0, 0.03 );
        float ww = min( gBay * 0.17, 0.045 );
        w_up = min( sdBox( q, vec2( ww, 0.06 ) ), length( q - vec2( 0.0, 0.06 ) ) - ww );
        vec2 q2 = wq - vec2( 0.0, -0.25 );
        w_dn = min( sdBox( q2, vec2( ww, 0.055 ) ), length( q2 - vec2( 0.0, 0.055 ) ) - ww );
    }
    // The portal: the central bay's ground floor is a tall arched door.
    float portal = 1e9;
    if ( abs( p.x ) < gBay * 0.5 )
    {
        vec2  q = p - vec2( 0.0, -0.27 );
        float pw2 = gBay * 0.3;
        portal = min( sdBox( q, vec2( pw2, 0.09 ) ), length( q - vec2( 0.0, 0.09 ) ) - pw2 );
        w_dn = 1e9;
    }
    float win = min( min( w_up, w_dn ), portal );
    // Moulded frames around the openings; the openings recessed.
    h += band( win - 0.008, 0.007, 0.012 );
    if ( win < 0.0 )
    {
        h = -0.03;
        glass = 1.0;
    }
    return h;
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
    int   nb = 5 + 2 * int( clamp( bayP, 0.0, 1.0 ) * 1.99 ); // 5 or 7 bays
    gHalfW = min( 0.5 * aspect - 0.06, 0.82 );
    gBay = 2.0 * gHalfW / float( nb );

    // Night sky over the square.
    vec3 col = mix( vec3( 0.02, 0.025, 0.05 ), vec3( 0.06, 0.07, 0.12 ), smoothstep( 0.5, -0.2, p.y ) );

    float glass;
    float h = relief( p, glass );
    if ( h > -0.5 && glass > -0.5 )
    {
        float e = 1.5 / resolution.y;
        float g1, g2;
        float hx = relief( p + vec2( e, 0.0 ), g1 ) - relief( p - vec2( e, 0.0 ), g2 );
        float hy = relief( p + vec2( 0.0, e ), g1 ) - relief( p - vec2( 0.0, e ), g2 );
        vec2  grad = vec2( hx, hy ) / ( 2.0 * e );
        grad = clamp( grad, -8.0, 8.0 );
        vec3 n = normalize( vec3( -grad * 0.6, 1.0 ) );
        // Projectors stand in the square, below and in front.
        vec3  L = normalize( vec3( 0.0, -0.35, 1.0 ) );
        float dif = max( dot( n, L ), 0.0 );
        // Shadows above protrusions (the light comes from below).
        float ocl = clamp( ( relief( p - vec2( 0.0, 0.012 ), g1 ) - h ) * 25.0, 0.0, 1.0 ) * 0.8;
        float lit = dif * ( 1.0 - ocl );

        // The stone itself, dimly lit by the street lamps.
        float stone_n = 0.85 + 0.15 * noise2( p * 80.0 );
        vec3  stone = vec3( 0.35, 0.3, 0.24 ) * stone_n;
        vec3  surf = stone * 0.08 * ( 0.6 + 0.4 * dif );

        // The show, in acts that cross-fade continuously.
        float act = T * 0.035;
        float w_photo = 0.55 + 0.45 * sin( act );
        float w_lines = 0.5 + 0.5 * sin( act * 1.3 + 2.0 );
        // Act 1: the photo, mapped to the facade, broken by the relief.
        vec2 fuv = vec2( p.x / ( 2.0 * gHalfW ) + 0.5, ( p.y - Ground ) / ( Top - Ground ) );
        fuv += vec2( 0.0, -0.4 ) * h; // the projection shifts on the relief
        vec3 photo = img( clamp( fuv, 0.0, 1.0 ) );
        vec3 proj = photo * w_photo * 1.2;
        // Act 2: light running along the outlines of the architecture.
        float edge = smoothstep( 0.8, 3.0, length( grad ) );
        float run = pow( 0.5 + 0.5 * sin( ( p.x * 6.0 + p.y * 3.0 ) * 3.0 - T * 0.8 ), 6.0 );
        vec3  line_c = imgPalette( 0.2 + hueP * 0.159 ) * 1.6 + 0.2;
        proj += line_c * edge * ( 0.25 + run + 1.5 * kick ) * w_lines;
        // Act 3: a glowing sweep passing across the front.
        float sx = 1.2 * sin( T * 0.05 );
        float sweep = exp( -pow( ( p.x - sx ) * 5.0, 2.0 ) );
        proj += imgPalette( 0.6 + hueP * 0.159 ) * 1.2 * sweep * ( 0.3 + 0.7 * swell );
        proj *= 0.7 + 0.6 * bass;
        surf += proj * lit * ( glass > 0.5 ? 0.15 : 1.0 );
        col = surf;
    }
    // A glow of the projection spilling into the haze above the square.
    col += vec3( 0.05, 0.05, 0.08 ) * ( 0.5 + bass ) * smoothstep( 0.1, Ground, p.y );

    // The crowd in the square: two rows of heads and shoulders, dark
    // against the lit facade, the back row smaller.
    float crowd = smoothstep( Ground - 0.06, Ground - 0.064, p.y );
    for ( int row = 0; row < 2; ++row )
    {
        float fr = float( row );
        float sc = 1.0 - 0.25 * fr;
        float cols = 26.0 / sc;
        float hi = floor( p.x * cols );
        for ( int k = -1; k <= 1; ++k )
        {
            float id = hi + float( k );
            float r = hash21( vec2( id, 3.0 + fr * 11.0 ) );
            float r2 = hash21( vec2( id, 5.0 + fr * 11.0 ) );
            vec2  c = vec2( ( id + 0.5 + 0.5 * ( r - 0.5 ) ) / cols, Ground - 0.035 + 0.02 * fr + 0.015 * r2 );
            vec2  q = ( p - c ) / sc;
            float head = length( q * vec2( 1.0, 0.85 ) ) - 0.011;
            float body = length( ( q - vec2( 0.0, -0.032 ) ) * vec2( 0.55, 1.0 ) ) - 0.02;
            float d = min( head, body ) * sc;
            crowd = max( crowd, smoothstep( 0.0012, -0.0012, d ) * step( p.y, c.y + 0.02 ) );
        }
    }
    col = mix( col, vec3( 0.008, 0.008, 0.012 ), crowd );

    col *= 0.9 + 0.2 * audioLevel;
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
