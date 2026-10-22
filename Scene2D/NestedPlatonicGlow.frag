#version 330 core
/*****************************************************************************\
 *                              NestedPlatonicGlow.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  NESTED PLATONIC GLOW: in every cell of a cubic lattice Platonic solids sit inside each other as edges of light
 *  -- a tetrahedron on alternate corners of a cube, the cube on eight corners of a dodecahedron, and a small solid
 *  at the heart -- each shell turning on its own axis at its own speed; the eye drifts down an aisle between the
 *  cells.
 *
 *  The dodecahedron's edges are found by folding with the icosahedral mirrors, after which half of one edge is
 *  left.  One colour family from the photo, a shade for each shell.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioAdvance     -> the shells turn, each at its own rate (integrated), and the drift
 *    audioHarmAdvance -> each chord change morphs the innermost solid into the next: tetrahedron, octahedron, cube
 *    audioSwell       -> the edges' glow widens
 *
 *  Knobs: edgeP (the edges' thickness), turnP (how fast the shells turn), hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;        ///< Seconds since this scene was activated.
uniform float sceneAdvance;     ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;     ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                ///< backwards).
uniform float audioLevel;       ///< Overall loudness, 0..1.
uniform float audioValence;     ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioPhase;       ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioHarmAdvance; ///< The harmony's advance: ~1 more with every chord change (integrated, never jumps
                                ///< back).
uniform float audioSwell;       ///< Slow loudness envelope, 0..1 (seconds).

uniform float edgeP; ///< Edge knob: the edges' thickness, 0..1.
uniform float turnP; ///< Turn knob: how fast the shells turn, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
/**  The photo read through a turning kaleidoscope -- the trick of the original Kaleidoscope/Tunnel scenes: uv is
 * folded into mirrored wedges around a slowly wandering centre and turned with time and the integrated audio phase,
 * so the texture itself keeps changing (detailed, continuous, never repeating).
 *
 * @param uv     Coordinate in the photo. (in)
 * @param sides  Number of mirror wedges (whole). (in)
 *
 * @return
 *   The folded coordinate.
 *
 * The fold is continuous at every wedge border and at the atan cut (sides is a whole number); the explicit mip level
 * avoids seams.
 **/
vec2 kaleidoUV( vec2 uv, float sides )
{
    vec2  c = vec2( 0.5 ) + 0.2 * vec2( sin( 0.0107 * sceneTime ), cos( 0.0131 * sceneTime ) );
    vec2  d = uv - c;
    float r = length( d );
    float sec = 6.2831853 / sides;
    float a = abs( mod( atan( d.y, d.x ), sec ) - 0.5 * sec );
    a += 0.03 * sceneTime + 0.25 * audioPhase;
    return c + r * vec2( cos( a ), sin( a ) );
}
/**  The photo through the scene's kaleidoscope.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The photo colour through the kaleidoscope (RGB).
 **/
vec3 imgK( vec2 uv, float lod )
{
    return imgLod( kaleidoUV( uv, 6.0 ), lod );
}
/**  Other channels than RGB: the photo's structure, read through the kaleidoscope.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The luma gradient per UV unit.
 *
 * Gradient / edges / Laplacian are rotation invariant in magnitude, so they stay seamless across the mirror folds
 * (direction-based colours would not).
 **/
vec2 imgKGrad( vec2 uv, float lod )
{
    float e = exp2( lod ) / 1024.0 + 0.001;
    return vec2( luma( imgK( uv + vec2( e, 0.0 ), lod ) ) - luma( imgK( uv - vec2( e, 0.0 ), lod ) ),
                 luma( imgK( uv + vec2( 0.0, e ), lod ) ) - luma( imgK( uv - vec2( 0.0, e ), lod ) ) )
           / ( 2.0 * e );
}
/**  Edge strength of the kaleidoscoped photo.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The edge strength.
 **/
float imgKEdge( vec2 uv, float lod )
{
    return length( imgKGrad( uv, lod ) ) * ( exp2( lod ) / 1024.0 + 0.001 ) * 6.0;
}
/**  Laplacian of the kaleidoscoped photo's luma (ridges and valleys).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level of the photo (0 = full detail). (in)
 *
 * @return
 *   The Laplacian of the luma (ridges > 0).
 **/
float imgKLap( vec2 uv, float lod )
{
    float e = exp2( lod ) / 1024.0 + 0.001;
    float c = luma( imgK( uv, lod ) );
    return ( luma( imgK( uv + vec2( e, 0.0 ), lod ) ) + luma( imgK( uv - vec2( e, 0.0 ), lod ) )
             + luma( imgK( uv + vec2( 0.0, e ), lod ) ) + luma( imgK( uv - vec2( 0.0, e ), lod ) ) - 4.0 * c )
           * 4.0;
}
/**  Embossed relief of the kaleidoscoped photo, lit from a direction.
 *
 * @param uv        Coordinate in the photo. (in)
 * @param lod       Mip level of the photo (0 = full detail). (in)
 * @param lightDir  Direction of the light in the image plane. (in)
 *
 * @return
 *   The relief shade, 0..1 (0.5 = flat).
 **/
float imgKRelief( vec2 uv, float lod, vec2 lightDir )
{
    vec2 g = imgKGrad( uv, lod ) * ( exp2( lod ) / 1024.0 + 0.001 ) * 8.0;
    return clamp( 0.5 + dot( g, normalize( lightDir ) ), 0.0, 1.0 );
}
/**  A second continuous transform: the photo wound into a log-polar spiral that zooms forever (Droste-like).
 *
 * @param uv    Coordinate in the photo. (in)
 * @param arms  Spiral arms (even: seamless at the atan cut). (in)
 * @param zoom  Zoom phase on integrated time. (in)
 *
 * @return
 *   The spiral coordinate (log radius and angle).
 *
 * angle/pi spans one mirror period, so the atan cut is seamless; the zoom runs on integrated time, never jumps.
 **/
vec2 spiralUV( vec2 uv, float arms, float zoom )
{
    vec2  d = uv - 0.5;
    float r = max( length( d ), 1e-4 );
    float a = atan( d.y, d.x );
    // Both coordinates jump by whole mirror periods (2) at the cut: the shear
    // a/pi jumps by 2, and a/pi*arms/2 by arms (arms must be even).
    return vec2( log( r ) * 0.5 - zoom + a / 3.14159265, a / 3.14159265 * arms * 0.5 );
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


// ---- the scene's colour family ----
/**  The hue the scene is built on: the photo's broad colour at a slowly wandering place; where the photo is grey, the
 * hue knob.
 *
 * @return
 *   The hue in turns, 0..1.
 *
 * It glides with the photos' cross-fade and never jumps.
 **/
float famHue()
{
    vec3 b = imgLod(
        vec2( 0.5 ) + 0.28 * vec2( cos( 0.009 * sceneTime + 0.013 * audioAdvance ), sin( 0.007 * sceneTime ) ), 7.0 );
    float k = smoothstep( 0.06, 0.22, satOf( b ) );
    vec2  v = mix( vec2( cos( hueP ), sin( hueP ) ),
                   vec2( cos( 6.2831853 * hueOf( b ) ), sin( 6.2831853 * hueOf( b ) ) ), k );
    return fract( atan( v.y, v.x ) / 6.2831853 + 1.0 );
}

/**  A colour of the family: t walks the neighbouring hues (a tenth of the circle around the base), at a fixed
 * saturation and full value.
 *
 * @param h  The family's hue (famHue()). (in)
 * @param t  Where in the family, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 famCol( float h, float t )
{
    return hsv2rgb( vec3( fract( h + 0.1 * ( t - 0.5 ) ), 0.7, 1.0 ) );
}

/**  A family colour lifted toward warm white light: the highlights and cores of glowing things.
 *
 * @param h  The family's hue. (in)
 * @param t  Where in the family, 0..1. (in)
 * @param w  How far toward warm white, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 famLight( float h, float t, float w )
{
    return mix( famCol( h, t ), vec3( 1.0, 0.93, 0.82 ), clamp( w, 0.0, 1.0 ) );
}

/**  The distance to a segment.
 *
 * @param x  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segD( vec3 x, vec3 a, vec3 b )
{
    vec3 ab = b - a;
    return length( x - a - ab * clamp( dot( x - a, ab ) / dot( ab, ab ), 0.0, 1.0 ) );
}

/**  The cube's edges, half size 1.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float cubeEdges( vec3 x )
{
    vec3 a = abs( x );
    return min( length( vec3( max( a.x - 1.0, 0.0 ), a.y - 1.0, a.z - 1.0 ) ),
                min( length( vec3( a.x - 1.0, max( a.y - 1.0, 0.0 ), a.z - 1.0 ) ),
                     length( vec3( a.x - 1.0, a.y - 1.0, max( a.z - 1.0, 0.0 ) ) ) ) );
}

/**  The tetrahedron's edges, on alternate corners of the cube of half size 1.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float tetraEdges( vec3 x )
{
    const vec3 v0 = vec3( 1.0, 1.0, 1.0 ), v1 = vec3( 1.0, -1.0, -1.0 ), v2 = vec3( -1.0, 1.0, -1.0 ),
               v3 = vec3( -1.0, -1.0, 1.0 );
    return min( min( min( segD( x, v0, v1 ), segD( x, v0, v2 ) ), min( segD( x, v0, v3 ), segD( x, v1, v2 ) ) ),
                min( segD( x, v1, v3 ), segD( x, v2, v3 ) ) );
}

/**  The octahedron's edges, vertices at distance 1.4 on the axes.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float octaEdges( vec3 x )
{
    vec3        a = abs( x );
    const float R = 1.4;
    return min( segD( a, vec3( R, 0.0, 0.0 ), vec3( 0.0, R, 0.0 ) ),
                min( segD( a, vec3( 0.0, R, 0.0 ), vec3( 0.0, 0.0, R ) ),
                     segD( a, vec3( 0.0, 0.0, R ), vec3( R, 0.0, 0.0 ) ) ) );
}

/**  The dodecahedron's edges through the cube's corners (vertices (+-1,+-1,+-1) and the cyclic (0, +-phi, +-1/phi)):
 * fold by the icosahedral mirrors, then measure to the half edge left in the corner.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float dodecaEdges( vec3 x )
{
    const vec3 r2 = vec3( -0.809017, -0.5, 0.309017 );
    for ( int k = 0; k < 6; ++k )
    {
        x.xy = abs( x.xy );
        x -= 2.0 * min( dot( x, r2 ), 0.0 ) * r2;
    }
    return segD( x, vec3( 0.0, 0.0, 1.618034 ), vec3( 0.618034, 0.0, 1.618034 ) );
}

/**  The innermost solid of a step in the cycle tetrahedron, octahedron, cube.
 *
 * @param x  The point. (in)
 * @param k  The step. (in)
 *
 * @return
 *   The distance to its edges.
 **/
float innerSolid( vec3 x, float k )
{
    float m = mod( k, 3.0 );
    return m < 0.5 ? tetraEdges( x ) : m < 1.5 ? octaEdges( x )
                                               : cubeEdges( x );
}

/**  A rotation about an axis.
 *
 * @param ax  The unit axis. (in)
 * @param a   The angle. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat3 axisRot( vec3 ax, float a )
{
    float c = cos( a ), s = sin( a );
    return mat3(
        c + ax.x * ax.x * ( 1.0 - c ), ax.y * ax.x * ( 1.0 - c ) + ax.z * s, ax.z * ax.x * ( 1.0 - c ) - ax.y * s,
        ax.x * ax.y * ( 1.0 - c ) - ax.z * s, c + ax.y * ax.y * ( 1.0 - c ), ax.z * ax.y * ( 1.0 - c ) + ax.x * s,
        ax.x * ax.z * ( 1.0 - c ) + ax.y * s, ax.y * ax.z * ( 1.0 - c ) - ax.x * s, c + ax.z * ax.z * ( 1.0 - c ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2        p = screenP();
    float       fh = famHue();
    const float Cell = 5.0;
    float       turn_rate = 0.4 + 0.8 * clamp( turnP, 0.0, 1.0 );
    float       ph = turn_rate * ( 0.04 * sceneTime + 0.35 * audioAdvance );
    float       h = max( audioHarmAdvance, 0.0 );
    float       hk = floor( h ), hm = smoothstep( 0.15, 0.85, h - hk );
    float       edge = ( 0.012 + 0.014 * clamp( edgeP, 0.0, 1.0 ) ) * ( 0.85 + 0.4 * clamp( audioSwell, 0.0, 1.0 ) );
    mat3        R0 = axisRot( normalize( vec3( 0.3, 1.0, 0.2 ) ), ph );
    mat3        R1 = axisRot( normalize( vec3( 1.0, 0.2, -0.4 ) ), -0.62 * ph );
    mat3        R2 = axisRot( normalize( vec3( -0.2, 0.5, 1.0 ) ), 0.37 * ph );
    float       drift = 0.3 * sceneTime + 1.3 * audioAdvance;
    vec3        ro = vec3( 2.5 + 0.35 * sin( 0.04 * drift ), 2.5 + 0.3 * cos( 0.033 * drift ), drift );
    vec3        rd = normalize( vec3( p, 1.15 ) );
    rd.xz = rot2( 0.35 * sin( 0.024 * sceneTime ) ) * rd.xz;
    rd.yz = rot2( 0.22 * sin( 0.019 * sceneTime + 1.0 ) ) * rd.yz;
    vec3  col = vec3( 0.0 );
    float t = 0.05;
    for ( int i = 0; i < 88; ++i )
    {
        vec3  x = ro + rd * t;
        vec3  cid = floor( x / Cell );
        vec3  q0 = x - ( cid + 0.5 ) * Cell;
        vec3  q = q0;
        float hc = fract( sin( dot( cid, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
        q = axisRot( normalize( vec3( hc - 0.5, 0.7, 0.3 ) ), 6.2831853 * hc ) * q;
        float d_out = dodecaEdges( R2 * q / 0.82 ) * 0.82;
        float d_mid = cubeEdges( R1 * q / 0.82 ) * 0.82;
        float d_tet = tetraEdges( R1 * q / 0.82 ) * 0.82;
        vec3  qi = R0 * q / 0.42;
        float d_in_a = innerSolid( qi, hk ) * 0.42, d_in_b = innerSolid( qi, hk + 1.0 ) * 0.42;
        float d_in = min( d_in_a, d_in_b );
        float fade = exp( -0.05 * t ) * smoothstep( 0.05, 0.5, t );
        float g_out = 1.0 / ( 1.0 + pow( max( d_out - edge, 0.0 ) * 55.0, 2.0 ) );
        float g_mid = 1.0 / ( 1.0 + pow( max( d_mid - edge, 0.0 ) * 55.0, 2.0 ) );
        float g_tet = 1.0 / ( 1.0 + pow( max( d_tet - edge, 0.0 ) * 55.0, 2.0 ) );
        // the innermost solids cross-fade in light (a blend of their distances would show neither)
        float g_in = ( 1.0 - hm ) / ( 1.0 + pow( max( d_in_a - edge, 0.0 ) * 55.0, 2.0 ) )
                     + hm / ( 1.0 + pow( max( d_in_b - edge, 0.0 ) * 55.0, 2.0 ) );
        col += ( famLight( fh, 0.15, 0.1 * g_out ) * g_out + famLight( fh, 0.45, 0.15 * g_mid ) * g_mid
                 + famLight( fh, 0.65, 0.2 * g_tet ) * g_tet + famLight( fh, 0.9, 0.5 * g_in ) * g_in * 1.3 )
               * fade * 0.05;
        float d = min( min( d_out, d_mid ), min( d_tet, d_in ) ) - edge;
        // never step past the cell's wall
        vec3 qc = ( Cell * 0.5 - abs( q0 ) ) / max( abs( rd ), 1e-3 );
        t += clamp( 0.7 * d, 0.02, max( min( qc.x, min( qc.y, qc.z ) ) + 0.02, 0.02 ) );
        if ( t > 40.0 )
            break;
    }
    col += famCol( fh, 0.5 ) * 0.012;
    finish( col );
}
