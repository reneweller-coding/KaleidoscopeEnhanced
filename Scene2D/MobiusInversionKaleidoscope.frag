#version 330 core
/*****************************************************************************\
 *                              MobiusInversionKaleidoscope.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  An Escher "Circle Limit"-style infinite kaleidoscope: NOT an angular mirror fold and NOT escape-time iteration,
 *  but repeated CIRCLE INVERSION through a symmetric ring of n circles (the classic Apollonian-gasket /
 *  Kleinian-group construction) -- a point that falls inside any circle is inverted back out through it, over and
 *  over, so the picture appears infinitely nested into ever-smaller tangent circles right up to their boundary.
 *
 *  Iteration count (how many inversions a pixel needed to escape) modulates brightness, giving the fractal lattice
 *  of nested circles its own visible structure independent of the photo underneath.
 *
 *    audioPhase  -> the ring of circles slowly rotates (integrated, jump-free)
 *    audioSwell  -> circle radius breathes, changing how deep the nesting reads
 *    audioBeat/audioKick -> brief flash on the boundary lattice
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioOnset;     ///< Onset envelope (any instrument), 0..1.
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   circlesP; ///< ring circle count (0 -> 5; 3..7)
uniform float ringP;    ///< ring radius (0 -> 0.62; 0.45..0.8)
uniform float overlapP; ///< circle radius as a fraction of the tangent radius (0 -> 1.08; 1.0..1.25 -- >1 =
                        ///< overlapping, cascades further)
uniform float glowP;    ///< Glow / afterglow knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

const int NIter = 16; ///< Number of inversion steps.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv )
             + ( 1.0 - interpolation ) * texture( tex1, uv ) )
        .rgb;
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    int   circles_v = ( circlesP < 3 ) ? 5 : circlesP;
    float ring_v = ( ringP <= 0.01 ) ? 0.62 : ringP;
    float overlap_v = ( overlapP <= 0.5 ) ? 1.08 : overlapP;
    float glow_v = ( glowP <= 0.01 ) ? 1.0 : glowP;

    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float ring_r = ring_v * ( 1.0 + 0.12 * audioSwell );
    float tangent_r = ring_r * sin( 3.14159265 / float( circles_v ) );
    float circ_r = tangent_r * overlap_v;
    float ring_rot = audioPhase * 0.25 + time * 0.01;

    float iters_used = 0.0;
    for ( int it = 0; it < NIter; ++it )
    {
        bool hit = false;
        for ( int k = 0; k < 7; ++k )
        {
            if ( k >= circles_v )
                break;
            float ang = ring_rot + float( k ) * 6.2831853 / float( circles_v );
            vec2  c = ring_r * vec2( cos( ang ), sin( ang ) );
            vec2  d = p - c;
            float len2 = dot( d, d );
            float r2 = circ_r * circ_r;
            if ( len2 < r2 && len2 > 1e-8 )
            {
                p = c + d * ( r2 / len2 );
                hit = true;
                iters_used += 1.0;
            }
        }
        if ( !hit )
            break;
    }

    float depth = iters_used / float( NIter );

    // Sample the (now deeply nested/inverted) coordinate as image UV, folded
    // once more so the picture itself reads symmetric across the ring.
    vec2 sample_uv = fract( p * 0.5 + 0.5 );
    vec3 pic = img( sample_uv );

    // Lattice structure from the inversion boundary itself (independent of
    // the photo): brighter where a pixel needed many inversions to escape,
    // i.e. right at the tangent points between circles.
    vec3 lattice = imgPalette( 0.15 + depth * 0.6 ) * ( 0.3 + 1.4 * depth * depth );

    vec3 col = mix( pic * ( 0.5 + 0.5 * ( 1.0 - depth ) ), lattice, 0.55 + 0.3 * depth );
    col += lattice * pow( depth, 3.0 ) * ( 0.4 + 0.5 * audioBeat + 0.3 * audioKick ) * glow_v;

    if ( hueP > 0.001 )
        col = hueRot( col, hueP );

    col *= glow_v * ( 1.05 + 0.3 * audioCentroid );
    col *= 1.0 + 0.35 * audioLevel;
    col += col * audioOnset * 0.12;

    vec3 cat_tone = clamp( col, 0.0, 1.0 ) * 0.95;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
