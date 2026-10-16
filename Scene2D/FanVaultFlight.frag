#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file FanVaultFlight.frag
 * @brief FAN VAULT FLIGHT: gliding slowly along the nave of a late-Gothic
 * chapel, after King's College, under its fan vault -- from every wall
 * shaft an inverted cone of stone spreads upward like a fan, ribbed like
 * a palm leaf, the fans meeting overhead in a lace of ribs and bosses.
 * The ribs are drawn in light, lines of it running out along the fans in
 * the rhythm; tall windows glow dimly between the shafts, and far ahead,
 * rows of candles burn along the choir stalls.  The camera glides at an
 * even pace.
 *
 * The vault is a height field (one conoid per springer) traced by marching.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the light in the rings of ribs, low to high up the fans
 *   audioBass         -> the light running out along the radial ribs
 *   audioSwell        -> the candle glow (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the glide (constant speed), the running light
 *
 * Per-activation variety: ribsP (how many ribs per fan), hueP.
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;         ///< Seconds since this scene was activated.
uniform float sceneAdvance;      ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float ribsP;
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

const float W = 4.2;   ///< half width of the nave
const float Bay = 6.4; ///< bay length
const float Rf = 3.3;  ///< fan radius
const float Ys = 7.5;  ///< springing height
const float Yt = 11.0; ///< crown of the vault
float       gRing[5];

/**  Height of the vault's underside over (x, z), and the fan coordinates.
 *
 * @param q    Position (x, z). (in)
 * @param fan  Receives the fan coordinates. (out)
 *
 * @return
 *   The height of the underside.
 **/
float vault( vec2 q, out vec2 fan )
{
    float zk = floor( q.y / Bay + 0.5 ) * Bay;
    float sx = sign( q.x ) * W;
    vec2  d = vec2( ( sx - q.x ) * sign( q.x ), q.y - zk ); // x: out from the wall
    float r = length( d );
    fan = vec2( r / Rf, atan( d.y, max( d.x, 1e-4 ) ) );
    if ( r >= Rf )
        return Yt;
    float k = 1.0 - r / Rf;
    return Yt - ( Yt - Ys ) * k * k;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p = ( uv - 0.5 ) * vec2( aspect, 1.0 );
    float bass = clamp( audioBass, 0.0, 1.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float T = sceneTime + sceneAdvance * 0.4;
    for ( int i = 0; i < 5; ++i )
    {
        float s = 0.0;
        for ( int j = 0; j < 6; ++j )
            s += audioSpectrum[min( i * 6 + j, 31 )];
        gRing[i] = clamp( s / 6.0 * ( 1.6 + 0.4 * float( i ) ), 0.0, 1.0 );
    }
    float n_rad = 10.0 + 6.0 * floor( clamp( ribsP, 0.0, 1.0 ) * 1.99 );

    // Gliding along the nave, looking forward and up into the vault.
    vec3 ro = vec3( 0.4, 1.7, T * 0.55 );
    vec3 fw = normalize( vec3( 0.0, 0.42, 1.0 ) );
    vec3 rt = normalize( cross( vec3( 0.0, 1.0, 0.0 ), fw ) );
    vec3 up = cross( fw, rt );
    vec3 rd = normalize( p.x * rt + p.y * up + 1.05 * fw );

    // Walls first (below the springing line).
    float t_wall = ( sign( rd.x ) * W - ro.x ) / rd.x;
    vec3  PW = ro + rd * t_wall;
    vec3  col;
    float t_hit;
    vec3  stone = vec3( 0.72, 0.68, 0.6 );
    // Above the springing line the wall still closes the bay (the lunette
    // under the fans): the vault is only hit if the ray reaches it first.
    float t_vault = 1e9;
    vec2  fan_hit = vec2( 2.0 );
    if ( PW.y >= Ys && rd.y > 0.0 )
    {
        float t = max( ( Ys - ro.y ) / rd.y, 0.0 );
        float t_end = min( ( Yt - ro.y ) / rd.y + 0.01, t_wall );
        float dt = ( t_end - t ) / 64.0;
        vec2  fan;
        for ( int i = 0; i < 64; ++i )
        {
            float tn = t + dt;
            vec3  P = ro + rd * tn;
            if ( P.y - vault( P.xz, fan ) > 0.0 )
            {
                float a = t, b = tn;
                for ( int k = 0; k < 6; ++k )
                {
                    float m = 0.5 * ( a + b );
                    vec3  M = ro + rd * m;
                    if ( M.y - vault( M.xz, fan ) > 0.0 )
                        b = m;
                    else
                        a = m;
                }
                t_vault = 0.5 * ( a + b );
                break;
            }
            t = tn;
        }
    }
    if ( ( PW.y < Ys || t_vault > t_wall ) && rd.y > -0.99 && !( rd.y < 0.0 && -ro.y / rd.y < t_wall ) )
    {
        t_hit = t_wall;
        float zb = PW.z / Bay;
        float fz = fract( zb ) - 0.5;
        // A wall shaft rising to each springer; tall windows between.
        float shaft = smoothstep( 0.06, 0.04, abs( abs( fz ) - 0.5 ) * Bay * 0.25 - 0.05 );
        float win = step( abs( fz ), 0.38 ) * step( 1.8, PW.y )
                    * step( PW.y, Ys - 0.6 - 0.8 * ( 1.0 - smoothstep( 0.0, 0.38, abs( fz ) ) ) );
        vec2  gq = vec2( fz * Bay * 2.0, PW.y * 1.2 );
        float lead = smoothstep( 0.08, 0.02, abs( fract( gq.x ) - 0.5 ) - 0.42 )
                     + smoothstep( 0.08, 0.02, abs( fract( gq.y ) - 0.5 ) - 0.42 );
        vec3  glass = mix( vec3( 0.1, 0.12, 0.35 ), vec3( 0.35, 0.1, 0.2 ), hash21( floor( gq ) + floor( zb ) * 7.0 ) );
        glass = mix( glass, imgPalette( hash21( floor( gq ) ) + hueP * 0.159 ) * 0.35, 0.3 );
        col = stone * 0.12;
        col = mix( col, glass * ( 1.2 + 0.6 * swell ) * ( 1.0 - clamp( lead, 0.0, 1.0 ) * 0.8 ), win );
        // The lunette above the springing line: plain stone with a blind arch.
        col = mix( col, stone * 0.2, step( Ys, PW.y ) );
        col = mix( col, stone * 0.22, shaft );
    }
    else if ( rd.y > 0.0 )
    {
        float t = t_vault;
        vec2  fan;
        t_hit = t;
        vec3  P = ro + rd * t;
        float yv = vault( P.xz, fan );
        // Normal from the height field.
        vec2  dummy;
        float e = 0.02;
        vec3  n = normalize( vec3( vault( P.xz + vec2( e, 0.0 ), dummy ) - vault( P.xz - vec2( e, 0.0 ), dummy ),
                                   -2.0 * e,
                                   vault( P.xz + vec2( 0.0, e ), dummy ) - vault( P.xz - vec2( 0.0, e ), dummy ) ) );
        // Candle light from below and the windows' cool light.
        float lit = 0.26 + 0.3 * max( dot( n, normalize( vec3( 0.0, -1.0, 0.3 ) ) ), 0.0 );
        col = stone * lit;
        if ( fan.x < 1.0 )
        {
            // Ribs on the fan: radial ones and rings.
            float ang = fan.y / 3.14159 * n_rad;
            float ra = abs( fract( ang ) - 0.5 );
            float fw_a = fwidth( ang ) * 1.2 + 0.02;
            float radial = smoothstep( fw_a, 0.0, ra - 0.02 ) * smoothstep( 0.02, 0.12, fan.x );
            float rr = fan.x * 5.0;
            float fw_r = fwidth( rr ) * 1.2 + 0.02;
            float ring = smoothstep( -fw_r * 0.5, fw_r * 0.5, abs( fract( rr ) - 0.5 ) - 0.45 );
            int   ri = int( clamp( floor( rr ), 0.0, 4.0 ) );
            // Panels between the ribs: cusped tracery, shaded.
            float panel = 0.9 + 0.1 * cos( fract( ang ) * 6.2831853 ) * cos( fract( rr ) * 6.2831853 );
            col *= panel;
            // Light runs out along the radial ribs from the springer.
            float run = pow( 0.5 + 0.5 * sin( fan.x * 9.0 - T * 1.6 ), 4.0 );
            vec3  lc = mix( vec3( 1.0, 0.8, 0.5 ), imgPalette( 0.08 + hueP * 0.159 ) * 1.3, 0.3 );
            col += lc * radial * ( 0.08 + 0.7 * run * ( 0.3 + bass ) );
            col += lc * ring * ( 0.08 + 1.1 * gRing[ri] );
            col = mix( col, stone * 0.5, max( radial, ring ) * 0.2 );
        }
        else
        {
            // The crown between the fans: a diamond of ribs and a boss.
            vec2  cq = vec2( P.x, mod( P.z, Bay ) - Bay * 0.5 );
            float diam = abs( abs( cq.x ) + abs( cq.y ) * 0.6 - 1.0 );
            float fw_d = fwidth( diam ) * 1.5 + 0.01;
            col += vec3( 1.0, 0.8, 0.5 ) * smoothstep( fw_d + 0.03, 0.0, diam ) * ( 0.1 + 0.6 * gRing[4] );
            col += vec3( 1.0, 0.85, 0.5 ) * smoothstep( 0.3, 0.2, length( cq ) ) * ( 0.2 + 0.3 * bass );
        }
    }
    else
    {
        // The floor: dark stone slabs.
        t_hit = -ro.y / rd.y;
        vec3 P = ro + rd * t_hit;
        col = vec3( 0.08, 0.075, 0.07 ) * ( 0.8 + 0.2 * noise2( P.xz * 2.0 ) );
    }
    col = mix( col, vec3( 0.1, 0.08, 0.07 ), 1.0 - exp( -t_hit * 0.025 ) );

    // Candles along the choir stalls ahead: warm flames with halos.
    for ( int side = 0; side < 2; ++side )
    {
        float sx = side == 0 ? -1.0 : 1.0;
        float z0 = floor( ro.z / 0.9 ) * 0.9;
        for ( int i = 2; i < 46; ++i )
        {
            float zc = z0 + float( i ) * 0.9;
            float h = hash11( zc * 1.3 + sx );
            vec3  C = vec3( sx * ( W - 1.1 ), 1.15 + 0.05 * h, zc );
            vec3  v = C - ro;
            float tl = dot( v, rd );
            if ( tl <= 0.0 || tl > t_hit )
                continue;
            vec3  dv = v - rd * tl;
            float dd = length( dv * vec3( 1.0, 0.55, 1.0 ) );
            float px = tl / resolution.y * 1.6;
            float flick = 0.85 + 0.15 * sin( T * 6.0 + h * 40.0 ) * sin( T * 3.7 + h * 17.0 );
            float flame = smoothstep( 0.022 + px, 0.012, dd );
            col += vec3( 1.0, 0.75, 0.35 ) * ( flame * 2.0 + exp( -dd * 18.0 ) * 0.12 ) * flick * ( 0.7 + 0.6 * swell );
        }
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
