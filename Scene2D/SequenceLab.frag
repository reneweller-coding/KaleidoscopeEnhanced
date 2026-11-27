#version 330 core
/*****************************************************************************\
 *                              SequenceLab.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SEQUENCE LAB: number sequences write the order into the picture -- the Fibonacci word, the Thue-Morse sequence,
 *  Rudin-Shapiro, the regular paper-folding sequence, the period-doubling sequence, the Cantor set -- each telling
 *  every cell of a grid whether, and how, the photo is changed in it: flipped, turned a quarter, shifted half a
 *  window, zoomed, or shown at another moment.
 *
 *  The sequence runs along the columns and along the rows, and the two are combined (exclusive or, and, or
 *  independently for the two axes).  The pictures are ordered but never periodic: the eye finds a rhythm that never
 *  repeats.  The second stage chooses the operation, the third the grid (squares, tall strips, rings and sectors, a
 *  slanted grid), the fourth the way the two sequences combine.  The walk changes one stage at a time and
 *  cross-fades; a new section changes all four.
 *
 *  Audio Reactivity (structure, not only light):
 *    audioSwell      -> how far the operations reach (the shift, the zoom, the time offset)
 *    audioPhase      -> the grid's slow drift and the windows' own clocks (integrated)
 *    audioSectionId/Age -> a new section re-rolls every stage (a new sequence)
 *
 *    voiceP          -> the voices' roles (voiceRoles(), plan 26.11.2026): kick, snare, hi-hat, melody, stereo,
 *                       build-up and bar phase each light a part of the picture of their own; 0 = as before
 *    depthLook 4     -> the subject anchor (plan M2, 26.11.2026): each photo is sampled shifted by its own
 *                       subject's offset from the centre (photoFocus; none without a sure subject), so the
 *                       lab's centre shows the subject; 0 = the old look
 *    depthLook 6     -> the anchor and frequency by depth (freqDepth(), plan P3, 27.11.2026): the bass brightens
 *                       the photo's near layer, the mids raise the colour of its middle layer, the highs set
 *                       fine round glints into its far layer; light and colour only; depthVar = its variant
 *  Knobs: seedP (the walk's seed), cellsP (how many cells), reachP (the base reach of the operations), hueP.
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
uniform float audioSwell;       ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioSectionId; ///< Slot of the current song section in the analyzer's fingerprint store (-1: none yet).
uniform float audioSectionPrev; ///< Slot of the previous song section.
uniform float audioSectionAge;  ///< Seconds since the current song section began.
uniform float audioKick;        ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSnare;       ///< Snare envelope, 0..1.
uniform float audioHat;         ///< Hi-hat / cymbal onset envelope, 0..1.
uniform float audioMelodyPitch; ///< Pitch of the melody, 0..1 over the tracked range.
uniform float audioMelodyConf;  ///< How sure the analysis is that a melody sounds, 0..1 (0 for drums, noise and
                                ///< silence).
uniform float audioStereoBal;   ///< Where the weight of the sound sits: -1 left .. 0 centre (and mono) .. +1 right, a
                                ///< second-long average.
uniform float audioBuildUp;     ///< Build-up toward a drop, 0..1.
uniform float audioBarPhase;    ///< Position within the current bar, 0..1.
uniform float audioBass;        ///< Bass band level, 0..1.
uniform float audioMid;         ///< Mid band level, 0..1.
uniform float audioHigh;        ///< High band level, 0..1.

uniform float seedP;  ///< Seed knob: the walk's seed, 0..1.
uniform float cellsP; ///< Cells knob: how many cells, 0..1.
uniform float reachP; ///< Reach knob: the base reach of the operations, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
// @depth
uniform vec2 photoDepthAmt; ///< 1 where the photo in tex0 (x) / tex1 (y) carries a depth map in its alpha channel, else
                            ///< 0.
uniform vec2 photoDepthWin; ///< Window depth of the photo's near end (x, depth 1) and far end (y, depth 0), from the
                            ///< host.
uniform vec4 photoFocus;    ///< Subject centre of the photo in tex0 (xy) and tex1 (zw), texture coordinates.
uniform vec4 photoSubject;  ///< Depth threshold (subject = depth >= it) and confidence of the photo in tex0 (xy), tex1
                            ///< (zw).

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


// ---- the photo's depth ----
/**  The photos' depth at a point and mip level: the alpha channel of tex0 and tex1 (the app's photo loader puts the
 * depth map there), each weighted with the cross-fade and with whether its photo has a map at all.
 *
 * @param uv   The point (mirrored at the edges, as imgLod()). (in)
 * @param lod  The mip level: the colour's, so depth and colour share one footprint. (in)
 *
 * @return
 *   The depth, 0 far .. 1 near; 0 where neither photo has a map.
 **/
float photoDepthLod( vec2 uv, float lod )
{
    uv = mirrorUV( uv );
    float w0 = interpolation * photoDepthAmt.x, w1 = ( 1.0 - interpolation ) * photoDepthAmt.y;
    return ( w0 * textureLod( tex0, uv, lod ).a + w1 * textureLod( tex1, uv, lod ).a ) / max( w0 + w1, 1e-4 );
}

/**  Writes the pixel's depth for whatever reads the scene's depth (the depth effects, the 2.5D parallax, the stereo):
 * the photo's depth on the window depths the host hands over (photoDepthWin, x for 1 = near, y for 0 = far; linear
 * in window depth is linear in inverse distance, as the maps are).
 *
 * @param d  The photo's depth there, 0 far .. 1 near (photoDepthLod()). (in)
 *
 * The far plane where neither photo has a map, as a scene without depth leaves it.  Call it on every path: a shader
 * that writes gl_FragDepth anywhere owns it everywhere.
 **/
void photoDepthOut( float d )
{
    float w = interpolation * photoDepthAmt.x + ( 1.0 - interpolation ) * photoDepthAmt.y;
    gl_FragDepth = w > 0.0 ? mix( photoDepthWin.y, photoDepthWin.x, clamp( d, 0.0, 1.0 ) ) : 1.0;
}


// ---- the subject anchor ----
/**  The photos at a point, each shifted by an offset of its own (the subject anchor, plan M2), and their depth.
 *
 * @param uv   The point (mirrored at the edges, as imgLod()). (in)
 * @param o0   The offset of the photo in tex0. (in)
 * @param o1   The offset of the photo in tex1. (in)
 * @param lod  The mip level. (in)
 *
 * @return
 *   The cross-faded colour (rgb) and the depth, 0 far .. 1 near (w; as photoDepthLod()).
 **/
vec4 imgDepthOff( vec2 uv, vec2 o0, vec2 o1, float lod )
{
    vec4  a = textureLod( tex0, mirrorUV( uv + o0 ), lod ), b = textureLod( tex1, mirrorUV( uv + o1 ), lod );
    float w0 = interpolation * photoDepthAmt.x, w1 = ( 1.0 - interpolation ) * photoDepthAmt.y;
    return vec4( ( interpolation * a + ( 1.0 - interpolation ) * b ).rgb,
                 ( w0 * a.a + w1 * b.a ) / max( w0 + w1, 1e-4 ) );
}

/**  How far one photo's subject lies from the picture's centre (plan M2): the shift that puts it where the fold's
 * centre samples -- zero without a depth map or a sure measure, so such a photo stays centred.
 *
 * @param f     The photo's subject centre, texture coordinates (photoFocus). (in)
 * @param conf  The confidence of the measure, 0..1 (photoSubject). (in)
 * @param amt   1 where the photo has a depth map (photoDepthAmt). (in)
 *
 * @return
 *   The offset from the picture's centre to the subject.
 **/
vec2 anchorOff( vec2 f, float conf, float amt )
{
    return ( f - 0.5 ) * smoothstep( 0.45, 0.55, conf ) * amt; // the maps trust a centre from conf 0.5 (26.11.)
}


// ---- frequency by depth (plan P3, 27.11.2026) ----
/**  A constant of the frequency-by-depth look, set by its variant inside a range (variant 0: the middle of every
 * range; the rule of the variant round of 23.10.2026).
 *
 * @param vi  The variant, 0..99. (in)
 * @param j   The constant's number. (in)
 * @param lo  The range's low end. (in)
 * @param hi  The range's high end. (in)
 *
 * @return
 *   The constant.
 *
 * The same formula as ChainLab2D's dv().
 **/
float fdVar( int vi, float j, float lo, float hi )
{
    return vi == 0 ? 0.5 * ( lo + hi )
                   : mix( lo, hi, fract( sin( float( vi ) * 12.9898 + j * 78.233 + 3.7 ) * 43758.5453 ) );
}

/**  The layers of frequency by depth: where far turns into middle (x) and middle into near (y), and the softness of
 * both edges (z) -- around the photos' mean depth (the depth map's 1 x 1 mip, cross-faded like the colour).
 *
 * @param vi  The variant, 0..99. (in)
 *
 * @return
 *   The two edges and their half width.
 *
 * Fixed thirds of the depth missed the photos: the maps are stretched between their 2nd and 98th percentile, but a
 * photo that recedes keeps most of its pixels far (the screening photo: mean 0.22 in the chain's view), and the near
 * layer was nearly empty.
 **/
vec3 fdLayers( int vi )
{
    float m = photoDepthLod( vec2( 0.5 ), 12.0 );
    float h = fdVar( vi, 12.0, 0.10, 0.18 );
    return vec3( m - h, m + h, fdVar( vi, 14.0, 0.05, 0.10 ) );
}

/**  Frequency by depth: the photo's depth splits the picture softly into near, middle and far (fdLayers(): around the
 * photo's mean depth); the bass (the kick's hit and the bass line under it) brightens the near layer, the mids
 * raise the colour of the middle one (its chroma around its luma), the highs (the hi-hat and the high band) set
 * fine round glints into the far one -- jittered points in cells of 1/64 .. 1/100 of the height, each with a size
 * and a twinkle of its own, the field drifting with the music's advance (rule V8e: the jitter (+-0.2) and the
 * radius (<= 0.24) keep every point inside its cell).
 *
 * @param col   The colour: the photo's own, at the pixel. (in)
 * @param d     The photo's depth there, 0 far .. 1 near. (in)
 * @param p     The centred screen position (screenP()). (in)
 * @param tint  The photo's broad colour there (a coarse mip). (in)
 * @param vi    The variant, 0..99. (in)
 *
 * @return
 *   The colour with the music in its layers.
 *
 * Every signal is a continuous envelope; nothing moves.  Where neither photo has a depth map the colour stays as it is,
 * and a cross-fade fades the look. The near layer's light and the glints carry the photo's own colour there brought up
 * to full brightness (as the chain lab's glow does): a gain alone left a dark photo dark -- on the screening photo (the
 * chain's picture at 18 of 255) the first version's glints added 0.2 of 255 to the far layer, and the eye saw none.
 * The sizes are those of 27.11.2026 evening (look6labs): the first ones (lift 16..32 %, a quarter of the own colour;
 * cells 1/110..1/170, 20..34 % lit, gain 1.2..2.2, half the own colour) read +2.1 of 255 in the near third and +0.4 in
 * the far one -- right in direction, too small to see.  The same evening the near layer's lift was bound to the room up
 * to white (the user asked for more; a gain on the colour gave a dark photo almost nothing and would have burnt a
 * bright one out): the lift is a gain of 2 and 0.8 of the own colour at full brightness, both times the room up to
 * white, so a dark near layer gains most and a bright one only what is left to white (the first try, gain 1 and 0.6
 * within the room, measured weaker than the old gain: the near layers of the test photos are their bright parts).  The
 * near layer's light follows the kick's envelope (below 3 Hz, a part of the picture), the far layer's only fine points
 * (the hat is too fast for a layer's light: temporal budget).
 **/
vec3 freqDepth( vec3 col, float d, vec2 p, vec3 tint, int vi )
{
    float have = interpolation * photoDepthAmt.x + ( 1.0 - interpolation ) * photoDepthAmt.y;
    vec3  t = fdLayers( vi );
    float w_n = smoothstep( t.y - t.z, t.y + t.z, d ) * have;
    float w_f = ( 1.0 - smoothstep( t.x - t.z, t.x + t.z, d ) ) * have;
    float w_m = max( have - w_n - w_f, 0.0 );
    vec3  own = tint / max( max( tint.r, max( tint.g, tint.b ) ), 0.05 ); // tint is a coarse mip: no grain to lift
    float bn = fdVar( vi, 16.0, 0.45, 0.75 ) * clamp( 0.7 * audioKick + 0.3 * clamp( audioBass, 0.0, 1.0 ), 0.0, 1.0 )
               * w_n;
    float head = 1.0 - clamp( luma( col ), 0.0, 1.0 ); // the room up to white
    col = col * ( 1.0 + 2.0 * bn * head ) + 0.8 * bn * head * own;
    float l = luma( col );
    col = max( l + ( col - l ) * ( 1.0 + fdVar( vi, 17.0, 0.5, 1.1 ) * clamp( audioMid, 0.0, 1.0 ) * w_m ), 0.0 );
    float hi = clamp( 0.8 * audioHat + 0.2 * audioHigh, 0.0, 1.0 );
    vec2  g = p * fdVar( vi, 18.0, 64.0, 100.0 ) + vec2( 0.29, 0.13 ) * sceneAdvance;
    vec2  gc = floor( g );
    vec2  gf = fract( g ) - 0.5 - 0.4 * ( hash22( gc + 3.0 ) - 0.5 );
    float gs = 0.6 + 0.4 * hash21( gc + 11.0 );
    float pt = step( fdVar( vi, 19.0, 0.44, 0.60 ), hash21( gc + 29.0 ) )
               * smoothstep( 0.24 * gs, 0.06 * gs, length( gf ) );
    float tw = 0.55 + 0.45 * sin( 6.2831853 * hash21( gc + 7.0 ) + 1.1 * sceneAdvance );
    float gl = fdVar( vi, 20.0, 2.4, 3.6 ) * hi * pt * tw * w_f;
    return col * ( 1.0 + gl ) + 0.8 * gl * own;
}


// ---- the lab's walk ----
/** Test pin of slot 0: 1 + the class to hold it on (0: the walk decides). */
uniform float labPinA;
/** Test pin of slot 1. */
uniform float labPinB;
/** Test pin of slot 2. */
uniform float labPinC;
/** Test pin of slot 3. */
uniform float labPinD;
/** Test pin of the variants: 1 + the variant 0..99 for every slot, or 1000 * (1 + the slot) + 1 + the variant for that
 * slot alone (the others at variant 0); 0: the walk decides. */
uniform float labPinV;
/** The share of an epoch a class change takes to cross-fade. */
const float LabFade = 0.2;
/** The classes of the four slots, for each of the (up to four) looks the walk blends. */
ivec4 gLabK[4];
/** The weights of those looks. */
float gLabW[4];
/** The variants (0..99) of the four slots' classes, for each of the looks the walk blends: a class is a family of
 * looks, the variant sets its constants (lv(), lk()); variant 0 is the lab's original look. */
ivec4 gLabV[4];

/**  A constant of a lab's look, set by a slot's variant inside a range.
 *
 * @param vi  The slot's variant, 0..99. (in)
 * @param j   The stream: another number for every constant of a look. (in)
 * @param lo  The lower end. (in)
 * @param hi  The upper end; variant 0 gives the middle. (in)
 *
 * @return
 *   The constant.
 **/
float lv( int vi, float j, float lo, float hi )
{
    return vi == 0 ? 0.5 * ( lo + hi )
                   : mix( lo, hi, fract( sin( float( vi ) * 12.9898 + j * 78.233 + 3.7 ) * 43758.5453 ) );
}

/**  A choice of a lab's look, set by a slot's variant.
 *
 * @param vi  The slot's variant, 0..99. (in)
 * @param j   The stream. (in)
 * @param n   The number of choices. (in)
 *
 * @return
 *   0 .. n-1; 0 (the original choice) for variant 0.
 **/
int lk( int vi, float j, int n )
{
    return vi == 0
               ? 0
               : min( int( fract( sin( float( vi ) * 37.719 + j * 51.37 + 1.9 ) * 43758.5453 ) * float( n ) ), n - 1 );
}

/**  A variant of a slot in an epoch: a hash of the slot, the epoch and the walk's seed.
 *
 * @param s     The slot, 0..3. (in)
 * @param e     The epoch (a whole number). (in)
 * @param seed  The walk's seed. (in)
 *
 * @return
 *   The variant, 0..99.
 **/
int labVar( int s, float e, float seed )
{
    return int( min( floor( hash21( vec2( e * 2.9 + seed * 1.3 + 11.0, float( s ) * 7.7 + 3.1 ) ) * 100.0 ), 99.0 ) );
}

/**  A class of a slot in an epoch: a hash of the slot, the epoch and the walk's seed.
 *
 * @param s     The slot, 0..3. (in)
 * @param e     The epoch (a whole number). (in)
 * @param seed  The walk's seed. (in)
 * @param n     The number of classes in the slot. (in)
 *
 * @return
 *   The class, 0..n-1.
 **/
int labCls( int s, float e, float seed, int n )
{
    return int(
        min( floor( hash21( vec2( e * 1.7 + seed, float( s ) * 9.13 + 2.1 ) ) * float( n ) ), float( n - 1 ) ) );
}

/**  The lab's walk through its vocabulary, into gLabK (class of every slot) and gLabW (weight of each look).
 *
 * @param seed    The walk's seed, rolled once per activation. (in)
 * @param n       The number of classes of each slot (0: the slot is not used). (in)
 * @param period  The epoch's length in units of the clock (1: about twenty seconds). (in)
 *
 * The slots change one after another (each takes a fifth of an epoch to cross-fade, the others stand), so a look
 * differs from the one it fades into by one class; a new section of the music re-rolls every slot (the old look fades
 * out over eight seconds).  The clock is the music's own advance with a floor of an epoch a minute.  The labPin knobs
 * hold a slot on a class (1 + class), for tests.
 **/
void labWalk( float seed, ivec4 n, float period )
{
    int   n_s = max( int( n.x > 0 ) + int( n.y > 0 ) + int( n.z > 0 ) + int( n.w > 0 ), 1 );
    float clk = ( 0.9 * sceneAdvance + sceneTime / 75.0 ) / period + fract( seed * 0.37 ) * 0.8;
    float m = smoothstep( 0.0, 8.0, audioSectionAge );
    if ( audioSectionPrev == audioSectionId )
        m = 1.0;
    for ( int j = 0; j < 2; ++j )
    {
        float sd = seed + 0.713 * ( j == 0 ? audioSectionPrev : audioSectionId );
        ivec4 base = ivec4( 0 ), alt = ivec4( 0 ), vbase = ivec4( 0 ), valt = ivec4( 0 );
        int   fs = 0;
        float ff = 0.0;
        for ( int s = 0; s < 4; ++s )
        {
            if ( n[s] <= 0 )
                continue;
            float w = clk + float( s ) / float( n_s );
            float e = floor( w );
            base[s] = labCls( s, e, sd, n[s] );
            alt[s] = labCls( s, e + 1.0, sd, n[s] );
            vbase[s] = labVar( s, e, sd );
            valt[s] = labVar( s, e + 1.0, sd );
            float f = smoothstep( 1.0 - LabFade, 1.0, w - e );
            if ( f > 0.0 )
            {
                fs = s;
                ff = f;
            }
        }
        float wj = j == 0 ? 1.0 - m : m;
        ivec4 b2 = base, vb2 = vbase;
        b2[fs] = alt[fs];
        vb2[fs] = valt[fs];
        gLabK[2 * j] = base;
        gLabV[2 * j] = vbase;
        gLabW[2 * j] = wj * ( 1.0 - ff );
        gLabK[2 * j + 1] = b2;
        gLabV[2 * j + 1] = vb2;
        gLabW[2 * j + 1] = wj * ff;
    }
    if ( labPinA + labPinB + labPinC + labPinD > 0.5 )
    {
        for ( int i = 0; i < 4; ++i )
        {
            if ( labPinA > 0.5 )
                gLabK[i].x = min( int( labPinA + 0.5 ) - 1, n.x - 1 );
            if ( labPinB > 0.5 )
                gLabK[i].y = min( int( labPinB + 0.5 ) - 1, n.y - 1 );
            if ( labPinC > 0.5 )
                gLabK[i].z = min( int( labPinC + 0.5 ) - 1, n.z - 1 );
            if ( labPinD > 0.5 )
                gLabK[i].w = min( int( labPinD + 0.5 ) - 1, n.w - 1 );
            gLabW[i] = i == 0 ? 1.0 : 0.0;
        }
    }
    if ( labPinV > 0.5 )
    {
        int pv = int( labPinV + 0.5 );
        int ps = pv / 1000 - 1;
        int vp = clamp( pv - 1000 * ( pv / 1000 ) - 1, 0, 99 );
        for ( int i = 0; i < 4; ++i )
        {
            if ( ps < 0 )
                gLabV[i] = ivec4( vp );
            else
            {
                gLabV[i] = ivec4( 0 );
                gLabV[i][ps] = vp;
            }
        }
    }
}


// ---- the voices of the music: one role each (plan 26.11.2026) ----
uniform float voiceP; ///< Strength of the voices' roles, 0..1 (0: the scene as it was; set by an expr element in the
                      ///< preset).

/**  The voices of the music as light on parts of the picture, one role each, the same in every scene: the kick pulses
 * the bright form, the snare lights a ring of the picture, the hi-hat a fine glitter on its light parts, the
 * melody's height a soft band across it, the stereo balance the weight of left against right, the build-up the
 * tension (contrast up, the light closing in), the bar phase a beam that wanders once round per bar.
 *
 * @param col  The scene's colour before the house finish. (in)
 * @param p    The centred screen position (screenP()). (in)
 *
 * @return
 *   The colour with the voices' light; col itself while voiceP is 0.
 *
 * Every role scales the picture's own colours -- no colour, line or edge of its own -- so the chain labs stay "only the
 * photo" (the user's decision of 17.10.2026, chain_classes.PHOTO_ONLY).
 **/
vec3 voiceRoles( vec3 col, vec2 p )
{
    if ( voiceP <= 0.0 )
        return col;
    float k = clamp( voiceP, 0.0, 1.0 );
    float l = luma( max( col, 0.0 ) );
    float r = length( p );
    // kick: the bright form pulses (the highlights more than the shadows)
    col *= 1.0 + 0.12 * k * clamp( audioKick, 0.0, 1.0 ) * smoothstep( 0.15, 0.7, l );
    // snare: a ring of the picture lights up in its own colours; the ring wanders slowly with the music's advance
    float rr = 0.27 + 0.05 * sin( 0.21 * sceneAdvance + 0.4 );
    float ring = exp( -( r - rr ) * ( r - rr ) / ( 0.035 * 0.035 ) );
    col *= 1.0 + 0.55 * k * clamp( audioSnare, 0.0, 1.0 ) * ring;
    // hi-hat: a fine glitter -- the picture glints at round, jittered points (cells of 1/90 of the height), so it
    // sparkles where it is light; every point with a weight of its own that changes slowly, the field drifting with
    // the music's advance
    vec2  g = p * 90.0 + vec2( 0.37, 0.11 ) * sceneAdvance;
    vec2  gc = floor( g );
    vec2  gf = fract( g ) - 0.5 - 0.5 * ( hash22( gc ) - 0.5 );
    float pt = step( 0.84, hash21( gc + 17.0 ) ) * smoothstep( 0.24, 0.06, length( gf ) );
    float tw = 0.5 + 0.5 * sin( 6.2831853 * hash21( gc + 5.0 ) + 0.9 * sceneAdvance );
    col *= 1.0 + 0.9 * k * clamp( audioHat, 0.0, 1.0 ) * pt * tw;
    // melody: a soft band of light whose height follows the melody (high notes high), while a melody sounds
    float by = mix( -0.32, 0.32, clamp( audioMelodyPitch, 0.0, 1.0 ) );
    float band = exp( -( p.y - by ) * ( p.y - by ) / ( 0.09 * 0.09 ) );
    col *= 1.0 + 0.16 * k * clamp( audioMelodyConf, 0.0, 1.0 ) * band;
    // stereo: the side the sound leans to is the heavier, brighter side (the balance is a second-long average)
    float sx = clamp( p.x / ( 0.5 * resolution.x / resolution.y ), -1.0, 1.0 );
    col *= 1.0 + 0.14 * k * clamp( audioStereoBal, -1.0, 1.0 ) * sx;
    // build-up: the tension rises towards the drop -- more contrast, and the light closes in on the middle
    float bu = k * clamp( audioBuildUp, 0.0, 1.0 );
    col = max( mix( vec3( 0.3 ), col, 1.0 + 0.35 * bu ), 0.0 ) * ( 1.0 - 0.3 * bu * smoothstep( 0.2, 0.75, r ) );
    // bar phase: a beam of light wanders once round the middle per bar (only while music plays)
    float beam = pow( 0.5 + 0.5 * cos( atan( p.y, p.x + 1e-6 ) - 6.2831853 * audioBarPhase ), 8.0 )
                 * smoothstep( 0.05, 0.35, r );
    col *= 1.0 + 0.12 * k * beam * smoothstep( 0.03, 0.2, audioLevel );
    return col;
}

uniform float depthLook;  ///< 4: the subject anchor (plan M2) -- each photo is sampled around its own subject; 6: the
                          ///< anchor and frequency by depth (plan P3); 0: the old look
uniform float depthVar;   ///< the variant of look 6, 0..99: freqDepth()'s constants; 0 = the middle of every range
float         gPhD = 0.0; ///< the photo's depth at the look's photo lookup, 0 far .. 1 near (photoDepthLod)
/**  The nth term of a sequence.
 *
 * @param s   The sequence, 0..5: Fibonacci word, Thue-Morse, Rudin-Shapiro, paper folding, period doubling, Cantor.
 *            (in)
 * @param vi  The sequence's variant 0..99: where it starts, whether it is complemented, its slope or forbidden
 *            digit. (in)
 * @param n   The index, a whole number from 0 up. (in)
 *
 * @return
 *   The term, 0 or 1.
 **/
float seqTerm( int s, int vi, float n )
{
    n = mod( n + float( lk( vi, 1.0, 8 ) ), 4096.0 );
    float cm = float( lk( vi, 3.0, 2 ) );
    if ( s == 0 )
    {
        float g = lv( vi, 2.0, 1.2360679, 2.0 );
        float w = floor( ( n + 2.0 ) / g ) - floor( ( n + 1.0 ) / g ) > 0.5 ? 1.0 : 0.0;
        return abs( w - cm );
    }
    int m = int( n );
    if ( s == 1 )
    {
        int c = 0;
        for ( int i = 0; i < 12; ++i )
            c += ( m >> i ) & 1;
        return abs( float( c & 1 ) - cm );
    }
    if ( s == 2 )
    {
        int c = 0;
        for ( int i = 0; i < 11; ++i )
            c += ( ( m >> i ) & 1 ) & ( ( m >> ( i + 1 ) ) & 1 );
        return abs( float( c & 1 ) - cm );
    }
    if ( s == 3 )
    {
        int v = m + 1;
        for ( int i = 0; i < 12; ++i )
        {
            if ( ( v & 1 ) == 0 )
                v >>= 1;
        }
        return abs( float( ( v >> 1 ) & 1 ) - cm );
    }
    if ( s == 4 )
    {
        int v = m + 1;
        int c = 0;
        for ( int i = 0; i < 12; ++i )
        {
            if ( ( v & 1 ) == 0 )
            {
                v >>= 1;
                c++;
            }
        }
        return abs( float( c & 1 ) - cm );
    }
    int   v = m;
    int   fd = ( 1 + lk( vi, 4.0, 3 ) ) - 3 * ( ( 1 + lk( vi, 4.0, 3 ) ) / 3 );
    float ok = 1.0;
    for ( int i = 0; i < 7; ++i )
    {
        if ( v - 3 * ( v / 3 ) == fd )
            ok = 0.0;
        v /= 3;
    }
    return abs( ok - cm );
}

/**  One look of the lab.
 *
 * @param k   The classes: x the sequence, y the operation, z the grid, w the combination of the two sequences. (in)
 * @param kv  The variants of those classes (the constants of each). (in)
 * @param p   The place. (in)
 * @param t   The clock. (in)
 * @param nc  The number of cells across a unit. (in)
 * @param rc  The reach of the operations. (in)
 *
 * @return
 *   The colour.
 **/
vec3 seqLook( ivec4 k, ivec4 kv, vec2 p, float t, float nc, float rc )
{
    float gx, gy;
    if ( k.z == 0 )
    {
        gx = p.x * nc;
        gy = p.y * nc;
    }
    else if ( k.z == 1 )
    {
        gx = p.x * nc * lv( kv.z, 1.0, 0.8, 1.6 );
        gy = 0.0;
    }
    else if ( k.z == 2 )
    {
        gx = atan( p.y, p.x ) / 6.2831853 * ( 18.0 + 2.0 * float( lk( kv.z, 2.0, 4 ) ) );
        gy = length( p ) * nc * lv( kv.z, 3.0, 1.0, 2.0 );
    }
    else
    {
        gx = ( p.x + lv( kv.z, 4.0, 0.2, 0.6 ) * p.y ) * nc;
        gy = ( p.y - lv( kv.z, 5.0, 0.1, 0.3 ) * p.x ) * nc;
    }
    float ix = floor( gx );
    float iy = floor( gy );
    vec2  loc = ( vec2( fract( gx ), fract( gy ) ) - 0.5 ) / nc; // the place in its cell, in screen units
    float bx = seqTerm( k.x, kv.x, ix );
    float by = seqTerm( k.x, kv.x, iy );
    float a = bx;
    float b = by;
    if ( k.w == 0 )
    {
        a = abs( bx - by );
        b = a;
    }
    else if ( k.w == 1 )
    {
        a = bx * by;
        b = a;
    }
    else if ( lk( kv.w, 1.0, 2 ) == 1 )
    {
        a = by;
        b = bx;
    }
    if ( k.w < 2 && lk( kv.w, 2.0, 2 ) == 1 )
    {
        a = 1.0 - a;
        b = a;
    }
    vec2  centre = p - loc;
    vec2  uv;
    float ls = lv( kv.y, 8.0, 0.6, 1.4 );
    if ( k.y == 0 )
        uv = ( centre + ls * vec2( a > 0.5 ? -loc.x : loc.x, b > 0.5 ? -loc.y : loc.y ) ) * 0.8 + 0.5;
    else if ( k.y == 1 )
        uv = ( centre + ls * ( a > 0.5 ? vec2( -loc.y, loc.x ) : loc ) ) * 0.8 + 0.5;
    else if ( k.y == 2 )
        uv = ( p + vec2( a, b ) * lv( kv.y, 1.0, 0.1, 0.34 ) * rc ) * 0.8 + 0.5;
    else if ( k.y == 3 )
        uv = ( centre
               + loc
                     * ( a > 0.5 ? 1.0 + lv( kv.y, 2.0, 0.1, 1.3 ) * rc
                                 : 1.0 / ( 1.0 + lv( kv.y, 3.0, 0.1, 0.9 ) * rc ) ) )
                 * 0.8
             + 0.5;
    else
        uv = p * 0.8 + 0.5
             + lv( kv.y, 4.0, 0.06, 0.18 ) * rc
                   * vec2( sin( lv( kv.y, 5.0, 0.2, 0.6 ) * t + lv( kv.y, 6.0, 1.5, 4.5 ) * a ),
                           cos( lv( kv.y, 7.0, 0.2, 0.5 ) * t + lv( kv.y, 6.0, 1.5, 4.5 ) * b ) );
    vec2  puv = uv;
    float plod = lv( kv.w, 3.0, 0.2, 0.6 );
    if ( depthLook > 3.5 )
    { // the subject anchor (plan M2); without it the colour stays bit for bit
        vec4 aq = imgDepthOff( puv, anchorOff( photoFocus.xy, photoSubject.y, photoDepthAmt.x ),
                               anchorOff( photoFocus.zw, photoSubject.w, photoDepthAmt.y ), plod );
        gPhD = aq.w;
        return aq.rgb;
    }
    gPhD = photoDepthLod( puv, plod ); // the depth where the colour is taken (26.11.2026)
    return imgLod( puv, plod );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 p = screenP();
    labWalk( seedP * 83.0, ivec4( 6, 5, 4, 3 ), 1.0 );
    float sw = clamp( audioSwell, 0.0, 1.0 );
    float nc = 4.0 + 7.0 * clamp( cellsP, 0.0, 1.0 );
    float rc = ( 0.6 + 0.8 * clamp( reachP, 0.0, 1.0 ) ) * ( 0.7 + 0.6 * sw );
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3  col = vec3( 0.0 );
    float ws = 0.0;
    float dsum = 0.0; // the looks' photo depth, weighted like their colours
    for ( int i = 0; i < 4; ++i )
    {
        if ( gLabW[i] > 0.002 )
        {
            col += gLabW[i] * seqLook( gLabK[i], gLabV[i], p, t, nc, rc );
            dsum += gLabW[i] * gPhD;
            ws += gLabW[i];
        }
    }
    float ph_d = dsum / max( ws, 1e-3 );
    photoDepthOut( ph_d );
    col = max( col / max( ws, 1e-3 ), 0.0 );
    if ( depthLook > 5.5 ) // look 6: the subject anchor and frequency by depth (plan P3, 27.11.2026)
        col = freqDepth( col, ph_d, screenP(), imgLod( screenP() * 0.5 + 0.5, 6.0 ),
                         int( clamp( depthVar, 0.0, 99.0 ) + 0.5 ) );
    finish( voiceRoles( col, screenP() ) );
}
