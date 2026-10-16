#version 330 core
/*****************************************************************************\
 *                              TricornFractalAntimatterSea.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRICORN FRACTAL ANTIMATTER SEA: Anti-holomorphic Tricorn (Mandelbar) fractal z -> conj(z)^2 + c.
 *
 *  Three-cornered fractal dragon scales, metallic antimatter fins, and high-frequency glowing crest ripples over an
 *  infinite complex sea.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous deep plunge into Tricorn dragon fin cusps
 *    audioKick    -> flashes antimatter core singularities & triggers crest bursts
 *    audioCentroid-> sharpens three-cornered boundary fin serrations
 *    audioSubBass -> expands dragon scale breathing scale
 *    audioChromaHue-> steers the deep ultraviolet / turquoise / platinum palette
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP;    ///< Speed knob, 0..1.
uniform float zoomP;     ///< Zoom knob, 0..1.
uniform float finSharpP; ///< Fin sharp knob, 0.7..1.4.
uniform float glowP;     ///< Glow / afterglow knob, 0..1.
uniform float hueP;      ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float zm = ( zoomP > 0.01 ) ? zoomP : 1.0;
    float f_shp = ( finSharpP > 0.01 ) ? finSharpP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    // Zoom target ON the boundary.  The old centre c = (-1.25, 0.0) lies
    // inside the set: every pixel ran all 48 iterations and the dive showed
    // one flat grey plane (catalogue review 29.09.2026).  (-1.1436, 0.0876)
    // was picked by measuring: at 10x and 100x about 30-45 % of the view is
    // interior and the escape counts spread widely -- detail all the way in.
    vec2 c_center = vec2( -1.1436, 0.0876 );
    // Zoom cycle. exp(mod(t * 0.65, 5.5)) snapped from e^5.5 (245x) back to
    // e^0 every ~8.5 s -- a hard cut. A raised cosine over the same period
    // dives in and eases back out instead: continuous in value AND velocity
    // (the derivative vanishes at both turns), so no seam anywhere.
    // Sub-bass magnifies the current zoom level, so the dragon scales swell on
    // drones. It multiplies the exp() RESULT, not its t-driven exponent --
    // scaling the exponent would jump the whole dive position in one frame.
    float zc = 0.5 - 0.5 * cos( 6.2831853 * fract( t * 0.65 / 5.5 ) ); // 0..1..0
    float zoom_level = exp( zc * 5.5 ) * ( 2.2 * zm ) * ( 1.0 + 0.12 * audioSwell );
    vec2  c = c_center + uv / zoom_level;

    vec2  z = c;
    float iter_count = 0.0;
    float trap = 1e5;

    // Tricorn loop: z = conj(z)^2 + c = (x - iy)^2 + c = (x^2 - y^2 - 2ixy) + c
    for ( int i = 0; i < 48; ++i )
    {
        z = vec2( z.x * z.x - z.y * z.y, -2.0 * z.x * z.y ) + c;

        float r2 = dot( z, z );
        trap = min( trap, abs( z.x ) + abs( z.y ) * 0.8 );

        if ( r2 > 16.0 )
        {
            iter_count = float( i ) - log2( max( 1.0, log2( r2 ) ) );
            break;
        }
    }

    if ( iter_count == 0.0 )
        iter_count = 48.0;

    // Sample distorted background photo
    vec2 sample_uv = fract( z * 0.25 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing dragon fin serrations
    float fin_glow = exp( -trap * ( 20.0 + 10.0 * audioCentroid ) * f_shp ) * glw;

    // Metallic antimatter palette
    vec3 pal_a = imgPalette( iter_count * 0.04 + trap * 0.2 );
    vec3 pal_b = imgPalette( iter_count * 0.04 + 0.5 );
    vec3 tricorn_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( iter_count * 0.8 + t ) );

    // The interior is not a flat fill: its orbit trap draws scales.
    float inside = step( 47.5, iter_count );
    vec3  inner_col = imgPalette( 0.55 + trap * 0.6 ) * ( 0.25 + 0.9 * exp( -trap * 3.0 ) );
    tricorn_col = mix( tricorn_col, inner_col, inside );
    // Photo only as a light texture: grey photos made the whole sea grey.
    float tg = dot( tricorn_col, vec3( 0.333 ) );
    tricorn_col = mix( vec3( tg ), tricorn_col, 1.6 ); // richer colour
    tricorn_col = mix( tricorn_col, tex_col * tricorn_col * 2.0, 0.2 + 0.1 * audioValence );

    // Add glowing fin serration highlights and kick flash
    vec3 fin_tint = vec3( 1.1, 1.4, 1.9 ) * fin_glow * ( 1.0 + 2.5 * audioKick );
    tricorn_col += fin_tint;

    // Core antimatter singularity bloom
    float core_bloom = exp( -trap * 4.0 ) * ( 0.8 + 1.8 * audioKick );
    tricorn_col += imgPalette( 0.85 ) * core_bloom;

    tricorn_col = pow( tricorn_col, vec3( 0.88 ) );
    tricorn_col /= 1.0 + 0.45 * max( tricorn_col.r, max( tricorn_col.g, tricorn_col.b ) ); // peak knee: tame local
                                                                                           // glare, keep midtones
    fragColor = vec4( clamp( tricorn_col, 0.0, 1.0 ), 1.0 );
}
