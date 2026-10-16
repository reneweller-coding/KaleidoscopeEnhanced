#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
// PrismExplode.frag — real dispersion, from Cauchy's equation.
// -----------------------------------------------------------------------
// A prism makes a spectrum because glass has a different refractive index for
// every wavelength.  Cauchy's equation is the usual one-line model of that:
//
//     n(lambda) = A + B / lambda^2        (lambda in micrometres)
//
// For a common crown glass A is about 1.52 and B about 0.0045, which puts n at
// 1.532 for blue at 0.45 um and 1.527 for red at 0.65 um.  That difference looks
// tiny, and the reason a prism works at all is that the DEVIATION amplifies it:
// each refraction multiplies the difference, and a wedge sends the ray through
// two of them.
//
// So the three channels are refracted SEPARATELY here, each with its own index,
// and the wedge angle the generator measured scales how far they separate.  A
// thin shard barely tints; a fat one throws a full spectrum.  Sampling the
// environment three times with three directions is the entire effect, and it is
// why this looks like glass rather than like a rainbow gradient painted on.
// -----------------------------------------------------------------------

in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vView;   ///< View vector (from the vertex stage).
in vec3  vObj;    ///< Object-space position (from the vertex stage).
in float vWedge;  ///< Wedge (from the vertex stage).
in float vSeed;   ///< Per-instance random seed (from the vertex stage).

/**
 * @file PrismExplode.frag
 * @brief Renders the exploding shell of glass-prism shards built by
 * PrismExplode.comp, refracting a procedural sky through each facet with
 * real chromatic dispersion (Cauchy's equation, one refraction per colour
 * channel) instead of a painted rainbow gradient.
 *
 * audioKick and audioSubBass widen the dispersion spread on transients;
 * audioBeat and audioSubBass also pulse the overall exposure. audioHigh adds
 * a faint white highlight and audioAmbient lifts the ambient fill. The
 * palette comes from imgPalette, a live sample of the current slideshow
 * photo whose sampling angle follows audioChromaHue (with an audioAdvance
 * drift) and whose saturation follows audioValence. The per-vertex vWedge
 * (facet wedge angle) scales how strongly a shard splits colour, and vSeed
 * varies facet-edge tinting between shards.
 */

uniform sampler2D tex0;          ///< The current photo.
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAmbient;   ///< How ambient (sustained, beatless) the music is, 0..1.

uniform float     glowP;        ///< Glow / afterglow knob, 0..1.
uniform float     hueP;         ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float     dispP;        ///< Disp knob, 0.4..1.8.
uniform sampler2D tex1;         ///< The next photo (cross-faded in by interpolation).
uniform float     audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                ///< backwards).
uniform float audioValence;     ///< preset: how strongly the glass disperses

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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
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

/**  A hue as a colour (the house palette).
 *
 * @param h  The hue, 0..1. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 hue2rgb( float h )
{
    return imgPalette( h ) * 1.35; // photo-arc palette (house standard), was HSV rainbow
}

/**  What the shard sees in a given direction.
 *
 * @param d        The direction. (in)
 * @param hueBase  Base hue. (in)
 *
 * @return
 *   The colour (RGB).
 *
 * There is no environment map here, so the surroundings are a cheap analytic sky: a bright band overhead, a warm floor
 * bounce, and a couple of hot spots that give the glass something to catch.
 **/
vec3 environment( vec3 d, float hueBase )
{
    float up = d.y * 0.5 + 0.5;
    vec3  sky = mix( vec3( 0.10, 0.13, 0.20 ), vec3( 0.75, 0.86, 1.10 ), up * up );
    sky += vec3( 1.05, 0.88, 0.60 ) * pow( max( -d.y, 0.0 ), 2.5 ) * 0.75;

    // Bright bands, and they are not decoration.  Dispersion is only VISIBLE
    // against high-frequency contrast: the three refracted directions differ by
    // a fraction of a degree, so on a smooth gradient all three land on almost
    // the same value and the shard comes out tinted rather than split.  A prism
    // in a featureless white room makes no rainbow either — it needs an edge.
    // These bands are that edge, and they are what turns the wedges into
    // spectra.
    float band = sin( d.y * 17.0 + d.x * 6.5 ) * 0.5 + 0.5;
    sky += vec3( 1.0, 0.95, 0.85 ) * pow( band, 14.0 ) * 0.9;

    vec3 key = normalize( vec3( 0.42, 0.78, -0.46 ) );
    sky += vec3( 1.0, 0.96, 0.90 ) * pow( max( dot( d, key ), 0.0 ), 90.0 ) * 6.0;
    vec3 key2 = normalize( vec3( -0.66, 0.18, -0.72 ) );
    sky += hue2rgb( fract( hueBase + 0.45 ) ) * pow( max( dot( d, key2 ), 0.0 ), 40.0 ) * 1.1;
    return sky;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 n = normalize( vNormal );
    vec3 V = normalize( vView );
    if ( dot( n, V ) < 0.0 )
        n = -n;

    float hueBase = fract( 0.55 * hueP + 0.08 * sin( audioChromaHue ) );

    // Cauchy indices for the three channels.  The spread is exaggerated by the
    // preset and by the shard's wedge, because a physically correct 0.005 would
    // be invisible at this scale.
    float spread = ( 0.35 + 1.5 * clamp( dispP, 0.0, 2.0 ) )
                   * ( 0.35 + 0.85 * vWedge )
                   * ( 0.7 + 0.9 * audioKick + 0.4 * audioSubBass );
    float A = 1.52;
    float n_r = A + 0.0045 / ( 0.65 * 0.65 );
    float n_g = A + 0.0045 / ( 0.55 * 0.55 );
    float n_b = A + 0.0045 / ( 0.45 * 0.45 );
    // Re-centre on green and amplify, so green passes straight and red and blue
    // fan out either side of it — which is what the eye reads as dispersion.
    float k_r = 1.0 + ( n_r - n_g ) * 150.0 * spread;
    float k_g = 1.0;
    float k_b = 1.0 + ( n_b - n_g ) * 150.0 * spread;

    vec3 I = -V;
    vec3 r_r = refract( I, n, 1.0 / ( n_g * k_r ) );
    vec3 r_g = refract( I, n, 1.0 / ( n_g * k_g ) );
    vec3 r_b = refract( I, n, 1.0 / ( n_g * k_b ) );

    // Total internal reflection returns a zero vector; fall back to the mirror
    // direction so a shard at a grazing angle turns reflective instead of black,
    // which is also what real glass does.
    vec3 mir = reflect( I, n );
    if ( dot( r_r, r_r ) < 1e-6 )
        r_r = mir;
    if ( dot( r_g, r_g ) < 1e-6 )
        r_g = mir;
    if ( dot( r_b, r_b ) < 1e-6 )
        r_b = mir;

    vec3 col;
    col.r = environment( normalize( r_r ), hueBase ).r;
    col.g = environment( normalize( r_g ), hueBase ).g;
    col.b = environment( normalize( r_b ), hueBase ).b;

    // Fresnel: glass is a mirror at grazing incidence and a window head-on.
    float f = pow( 1.0 - clamp( dot( n, V ), 0.0, 1.0 ), 4.0 );
    // Flat facets carry the dispersion split as SOLID complementary
    // colours (candy shards) — blend well toward the unsplit mirror.
    col = mix( col, environment( mir, hueBase ), clamp( 0.55 + f * 0.35, 0.0, 0.95 ) );

    // Facet edges catch the light: without them a shard is a smooth blob and the
    // shell reads as a cloud rather than as broken glass.
    col += hue2rgb( fract( hueBase + 0.30 + 0.25 * vSeed ) ) * f
           * ( 0.25 + 0.8 * glowP ) * ( 0.4 + 1.2 * audioKick );

    col += vec3( 0.10, 0.12, 0.18 ) * audioAmbient;
    col *= 1.0 + 0.22 * audioBeat + 0.14 * audioSubBass;
    col += vec3( 1.0 ) * 0.05 * audioHigh;
    col = col / ( 1.0 + col * 0.30 );
    fragColor = vec4( col, interpolation );
}
