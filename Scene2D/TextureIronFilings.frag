#version 330 core
/*****************************************************************************\
 *                              TextureIronFilings.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TEXTURE IRON FILINGS: iron filings on paper over moving magnets -- thousands of tiny dark needles lie on the
 *  photograph (printed on the paper) and align themselves with the magnetic field: they trace the field lines
 *  between the poles in arcs and spirals, bunch up densely at the poles, and as the hidden magnets glide and turn
 *  beneath the paper the whole pattern slowly re-forms.
 *
 *  The poles glow faintly.  Endless, mirrorable.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioAdvance    -> the magnets glide (integrated, jump-free)
 *    audioPhase      -> the magnets turn (integrated)
 *    audioSpread     -> the field reaches further (more filings aligned)
 *    audioKick       -> the poles glow (light)
 *    audioMode       -> the paper: cool grey in minor, warm cream in major
 *    audioRoughness  -> the filings jitter
 *
 *  Knobs: densityP (filings), lengthP (needle length), photoP (the printed photo), hueP.
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
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioSpread;    ///< Spectral spread, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioMode;      ///< Mode of the music: 0 minor .. 1 major.
uniform float audioRoughness; ///< Roughness (dissonance) of the sound, 0..1.

uniform float densityP; ///< Density knob, 0..1.
uniform float lengthP;  ///< Length knob: needle length, 0..1.
uniform float photoP;   ///< Photo knob: how much of the photo shows, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

// ---- shared building blocks (texture pool, noise, shapes) ----
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
/**  Pseudo-random 2D vector (each 0..1) from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   Two pseudo-random numbers 0..1.
 **/
vec2 hash22( vec2 p )
{
    vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.xx + p3.yz ) * p3.zy );
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
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 2.3;
        a *= 0.5;
    }
    return v;
}
/**  Fractal noise of three octaves, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, 0..1.
 **/
float fbm3( vec2 p )
{
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 3; ++i )
    {
        v += a * noise2( p );
        p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 2.3;
        a *= 0.5;
    }
    return v;
}

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
/**  Mirror-repeat in the shader (the engine's textures mirror, the editor's repeat -- doing it here makes both
 * identical).
 *
 * @param uv  The coordinate, any range. (in)
 *
 * @return
 *   The coordinate mirror-repeated into 0..1.
 *
 * Identity inside [0,1].
 **/
vec2 mirrorUV( vec2 uv )
{
    return 1.0 - abs( fract( uv * 0.5 ) * 2.0 - 1.0 );
}
/**  The photo at a mip level: lod 0 is full detail, ~4 a soft field, ~7 broad masses.
 *
 * @param uv   Coordinate in the photo (mirror-repeated outside 0..1). (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 imgLod( vec2 uv, float lod )
{
    uv = mirrorUV( uv );
    return ( interpolation * textureLod( tex0, uv, lod ) + ( 1.0 - interpolation ) * textureLod( tex1, uv, lod ) ).rgb;
}
/**  Luminance of a colour (Rec. 601 weights).
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The luminance.
 **/
float luma( vec3 c )
{
    return dot( c, vec3( 0.299, 0.587, 0.114 ) );
}
/**  HSV (all 0..1) to RGB.
 *
 * @param c  Hue, saturation and value, all 0..1. (in)
 *
 * @return
 *   The RGB colour.
 **/
vec3 hsv2rgb( vec3 c )
{
    vec3 k = clamp( abs( mod( c.x * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 );
    return c.z * mix( vec3( 1.0 ), k, c.y );
}
/**  Hue of a colour, 0..1.
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The hue, 0..1.
 **/
float hueOf( vec3 c )
{
    float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) ), d = mx - mn + 1e-5;
    float h = ( mx == c.r ) ? ( c.g - c.b ) / d : ( mx == c.g ) ? 2.0 + ( c.b - c.r ) / d
                                                                : 4.0 + ( c.r - c.g ) / d;
    return fract( h / 6.0 );
}
/**  Saturation of a colour, 0..1.
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The saturation, 0..1.
 **/
float satOf( vec3 c )
{
    float mx = max( c.r, max( c.g, c.b ) );
    return ( mx - min( c.r, min( c.g, c.b ) ) ) / max( mx, 1e-3 );
}
/**  A glowing colour for a place: the photo's own hue where it has one, a slowly wandering hue field (anchored on
 * hue0) where the photo is grey.
 *
 * @param photo  The photo's colour at the place. (in)
 * @param q      The place; drives the wandering hue field. (in)
 * @param hue0   Anchor hue, 0..1. (in)
 *
 * @return
 *   The glow colour (RGB, bright).
 **/
vec3 glowColour( vec3 photo, vec2 q, float hue0 )
{
    vec3 field = hsv2rgb( vec3( fract( hue0 + 0.55 * fbm3( q * 0.8 ) + 0.03 * audioAdvance ), 0.85, 1.0 ) );
    vec3 own = photo / max( max( photo.r, max( photo.g, photo.b ) ), 1e-3 );
    own = own * own * own;
    return mix( field, own, smoothstep( 0.12, 0.35, satOf( photo ) ) );
}
/**  Push a colour toward full saturation, keeping its hue (neon from a photo).
 *
 * @param c  The colour. (in)
 * @param k  Exponent: the higher, the purer (and darker) the neon. (in)
 *
 * @return
 *   The saturated colour.
 **/
vec3 neonOf( vec3 c, float k )
{
    vec3 n = c / max( max( c.r, max( c.g, c.b ) ), 1e-3 );
    return pow( n, vec3( k ) );
}
/**  The photo along an endless scroll in y without mirror seams: the photo repeats mirrored, so a scroll crosses a
 * visible fold every unit; two reads half a period apart are cross-faded so each fold is hidden by the other.
 *
 * @param uv   Coordinate in the photo; y may run on endlessly. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The photo colour (RGB).
 **/
vec3 imgScroll( vec2 uv, float lod )
{
    float w = abs( fract( uv.y ) - 0.5 ) * 2.0; // 1 at the fold, 0 between
    w = smoothstep( 0.55, 1.0, w );
    return mix( imgLod( uv, lod ), imgLod( uv + vec2( 0.37, 0.5 ), lod ), w );
}
/**  Height from the photo: broad masses plus a share of the detail.
 *
 * @param uv        Coordinate in the photo. (in)
 * @param lodBroad  Mip level of the broad masses. (in)
 * @param detail    Share of the detail three mip levels finer, 0..1. (in)
 *
 * @return
 *   The height (luma of the photo), 0..1.
 **/
float texHeight( vec2 uv, float lodBroad, float detail )
{
    return mix( luma( imgLod( uv, lodBroad ) ), luma( imgLod( uv, max( lodBroad - 3.0, 0.0 ) ) ), detail );
}
/**  Gradient of the photo's luma at a mip level (per UV unit).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The luma gradient per UV unit.
 **/
vec2 texGrad( vec2 uv, float lod )
{
    float e = exp2( lod ) / 1024.0;
    return vec2( luma( imgLod( uv + vec2( e, 0.0 ), lod ) ) - luma( imgLod( uv - vec2( e, 0.0 ), lod ) ),
                 luma( imgLod( uv + vec2( 0.0, e ), lod ) ) - luma( imgLod( uv - vec2( 0.0, e ), lod ) ) )
           / ( 2.0 * e );
}
/**  Edge strength of the photo (0..1-ish) at a mip level.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The edge strength, about 0..1.
 **/
float texEdge( vec2 uv, float lod )
{
    return length( texGrad( uv, lod ) ) * exp2( lod ) / 1024.0 * 6.0;
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

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}
/**  Smooth minimum of two distances (blend width k).
 *
 * @param a  One distance. (in)
 * @param b  The other distance. (in)
 * @param k  Blend width. (in)
 *
 * @return
 *   The smooth minimum.
 **/
float smin( float a, float b, float k )
{
    float h = clamp( 0.5 + 0.5 * ( b - a ) / k, 0.0, 1.0 );
    return mix( b, a, h ) - k * h * ( 1.0 - h );
}
/**  Distance from a point to a line segment.
 *
 * @param p  The point. (in)
 * @param a  One end of the segment. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float sdSeg( vec2 p, vec2 a, vec2 b )
{
    vec2  pa = p - a, ba = b - a;
    float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
    return length( pa - ba * h );
}
/**  Centred coordinates: y in -0.5..0.5, x scaled by the aspect.
 *
 * @return
 *   The pixel's centred coordinate (y in -0.5..0.5, x scaled by the aspect).
 **/
vec2 screenP()
{
    return ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( resolution.x / resolution.y, 1.0 );
}
/**  House finish: loudness brightness and the soft highlight roll-off.
 *
 * @param col  The scene's colour; written to fragColor after the finish. (in)
 **/
void finish( vec3 col )
{
    col *= 0.9 + 0.2 * audioLevel;
    vec3 t = max( col, 0.0 );
    t /= 1.0 + 0.35 * max( t.r, max( t.g, t.b ) );
    fragColor = vec4( clamp( t, 0.0, 1.0 ), 1.0 );
}

vec2 gPos[4]; ///< Positions of the four magnets.
vec2 gDir[4]; ///< Directions of the four magnets.
/**  2D dipole field (line poles), and its stream function: the field lines are its isolines, so filings can gather
 * along them.
 *
 * @param x    The point. (in)
 * @param psi  Receives the stream function. (out)
 *
 * @return
 *   The field vector.
 **/
vec2 field( vec2 x, out float psi )
{
    vec2 B = vec2( 0.0 );
    psi = 0.0;
    for ( int i = 0; i < 4; ++i )
    {
        vec2 n = gPos[i] + gDir[i] * 0.08, s = gPos[i] - gDir[i] * 0.08;
        vec2 dn = x - n, ds = x - s;
        B += dn / ( dot( dn, dn ) + 0.0005 ) - ds / ( dot( ds, ds ) + 0.0005 );
        psi += atan( dn.y, dn.x ) - atan( ds.y, ds.x );
    }
    return B;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  p = screenP();
    float kick = clamp( audioKick, 0.0, 1.0 );
    float rough = clamp( audioRoughness, 0.0, 1.0 );
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    float spin = 0.03 * sceneTime + 0.3 * audioPhase;
    for ( int i = 0; i < 4; ++i )
    {
        float fi = float( i );
        gPos[i] = 0.55
                  * vec2( sin( T * ( 0.7 + 0.2 * fi ) + fi * 1.9 ), 0.6 * cos( T * ( 0.5 + 0.25 * fi ) + fi * 2.7 ) );
        float ang = spin * ( mod( fi, 2.0 ) < 0.5 ? 1.0 : -1.3 ) + fi * 1.3;
        gDir[i] = vec2( cos( ang ), sin( ang ) );
    }
    float mode = clamp( audioMode, 0.0, 1.0 );
    vec2  uv = p * 0.7 + 0.5;
    vec3  paper = mix( vec3( 0.78, 0.8, 0.83 ), vec3( 0.92, 0.87, 0.76 ), mode );
    paper = mix( paper, paper * ( 0.55 + 0.6 * imgLod( uv, 1.5 ) ), 0.6 * clamp( photoP, 0.0, 1.0 ) );
    paper *= 0.95 + 0.05 * noise2( p * 300.0 );
    vec3 col = paper;
    // Filings: short needles in jittered cells, oriented along the field.
    float dens = 0.45 + 0.5 * clamp( densityP, 0.0, 1.0 );
    float reach = 0.4 + 0.8 * clamp( audioSpread, 0.0, 1.0 );
    float ink = 0.0;
    for ( int L = 0; L < 2; ++L )
    {
        float fl = float( L );
        float S = 70.0 + 40.0 * fl;
        vec2  g = p * S + fl * 7.3;
        vec2  gi = floor( g );
        for ( int j = -1; j <= 1; ++j )
            for ( int i = -1; i <= 1; ++i )
            {
                vec2  id = gi + vec2( i, j );
                vec2  c = id + 0.2 + 0.6 * hash22( id + fl );
                vec2  cw = ( c - fl * 7.3 ) / S;
                float psi;
                vec2  B = field( cw, psi );
                float bm = length( B );
                // Filings gather where the field is strong, and along field lines.
                float gather = smoothstep( 0.5, 12.0 * ( 1.2 - 0.6 * reach ), bm );
                float line = 0.5 + 0.5 * cos( psi * 6.0 ); // integer multiple: continuous across the atan cuts
                if ( hash21( id + 3.0 + fl ) > dens * ( 0.2 + 0.8 * gather ) * ( 0.3 + 0.9 * line ) )
                    continue;
                vec2  dir = B / max( bm, 1e-4 );
                float jit = ( hash21( id + 5.0 ) - 0.5 ) * ( 0.15 + 0.8 * rough ) * ( 1.0 - 0.8 * gather );
                dir = rot2( jit ) * dir;
                float len = ( 0.35 + 0.6 * clamp( lengthP, 0.0, 1.0 ) ) * ( 0.6 + 0.5 * hash21( id + 7.0 ) );
                float d = sdSeg( g, c - dir * len * 0.5, c + dir * len * 0.5 );
                ink = max( ink, smoothstep( 0.1, 0.03, d ) * ( 0.6 + 0.4 * gather ) );
            }
    }
    col *= 1.0 - 0.85 * ink;
    // The poles glow faintly through the paper.
    vec3 gc = glowColour( imgLod( uv, 5.0 ), p, hueP * 0.159 );
    for ( int i = 0; i < 4; ++i )
    {
        float d1 = length( p - gPos[i] - gDir[i] * 0.08 ), d2 = length( p - gPos[i] + gDir[i] * 0.08 );
        col += gc * ( exp( -d1 * 25.0 ) + exp( -d2 * 25.0 ) ) * ( 0.05 + 0.4 * kick );
    }
    finish( col );
}
