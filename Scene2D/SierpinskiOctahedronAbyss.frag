#version 330 core
/*****************************************************************************\
 *                              SierpinskiOctahedronAbyss.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SIERPINSKI OCTAHEDRON ABYSS: 3D Raymarching continuous dive into the heart of a Sierpinski Octahedron (IFS)
 *  fractal.
 *
 *  Endless nested pyramid canyons, sharp triangular facet reflections, and high-voltage glowing vertex sparks.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous forward plunge into recursive pyramid voids
 *    audioKick    -> flashes octahedron vertex nodes & triggers lattice expansion burst
 *    audioCentroid-> sharpens triangular facet edge resolution
 *    audioSubBass -> expands octahedron breathing scale
 *    audioChromaHue-> rotates the luminous geometric crystal palette
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
uniform float speedP; ///< Speed knob, 0..1.
uniform float scaleP; ///< Scale knob.
uniform float foldP;  ///< Fold knob, 0..1.
uniform float glowP;  ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  3D Sierpinski Octahedron IFS distance estimator
 *
 * @param p          The point. (in)
 * @param t          Time. (in)
 * @param trapLevel  Receives the orbit trap level. (out)
 *
 * @return
 *   The distance estimate.
 **/
float mapSierpinski( vec3 p, float t, out float trapLevel )
{
    vec3  q = p;
    float scale = 1.0;
    trapLevel = 0.0;

    for ( int i = 0; i < 6; ++i )
    {
        // Octahedral plane foldings
        if ( q.x + q.y < 0.0 )
            q.xy = -q.yx;
        if ( q.x + q.z < 0.0 )
            q.xz = -q.zx;
        if ( q.y + q.z < 0.0 )
            q.yz = -q.zy;

        q = q * 2.0 - vec3( 1.2, 1.2, 1.2 );
        scale *= 2.0;
        trapLevel += dot( q, q ) * 0.08;
    }

    // Distance to regular octahedron base
    float d_oct = ( abs( q.x ) + abs( q.y ) + abs( q.z ) - 1.2 ) / scale;
    return d_oct * 0.7;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float sc = ( scaleP > 0.01 ) ? scaleP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.168 * spd + audioAdvance * 0.168 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Continuous dive along diagonal axis towards origin
    float dive_prog = mod( t * 0.6, 2.0 );
    vec3  ro = vec3( 2.5 - dive_prog * 0.8, 2.5 - dive_prog * 0.8, 2.5 - dive_prog * 0.8 ) * sc;
    vec3  ta = vec3( 0.0, 0.0, 0.0 );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );
    vec3 rd = normalize( uv.x * uu + uv.y * vv + ( 1.25 + 0.2 * sin( audioSwell * 2.0 ) ) * ww );

    // Raymarch through Sierpinski fractal
    float tot_dist = 0.0;
    float min_d = 1e4;
    float hit_trap = 0.0;
    vec3  hit_col = vec3( 0.0 );

    // Sub-bass breathes the whole octahedron lattice. Done as the textbook
    // uniform-scale wrap (divide the sample point, multiply the returned
    // distance) so the estimator stays conservative -- scaling only one side
    // would overshoot the surface and punch holes in the fractal.
    float breath = 1.0 + 0.30 * audioSubBass;

    for ( int i = 0; i < 54; ++i )
    {
        vec3  p = ro + rd * tot_dist;
        float cur_trap;
        float d = mapSierpinski( p / breath, t, cur_trap ) * breath;
        min_d = min( min_d, abs( d ) );

        if ( abs( d ) < 0.003 || tot_dist > 8.0 )
        {
            hit_trap = cur_trap;
            vec2 sample_uv = fract( p.xy * 0.3 + p.z * 0.3 + 0.5 );
            vec3 tex_col = img( sample_uv );
            vec3 pal_col = imgPalette( hit_trap * 0.2 + t * 0.05 );
            hit_col = mix( tex_col, pal_col, 0.5 ) * ( 0.7 + 0.4 * ( 1.0 - d ) );
            break;
        }

        tot_dist += max( 0.015, d * 0.7 );
    }

    // Glowing triangular facet edges. min_d tracks the MINIMUM distance seen
    // across the whole 54-step march, so for a ray passing anywhere near
    // this recursively-detailed fractal it sits close to 0 across most of
    // the visible silhouette -- and the 1.7 tint constant alone already
    // exceeds 1.0 with NO kick at all, which is why the whole fractal shape
    // (not just its edges) was blowing out to a flat white triangle on
    // every frame. Cap the glow*audio product directly.
    float edge_glow = min( exp( -min_d * ( 26.0 + 14.0 * audioCentroid ) ) * glw * ( 1.0 + 2.5 * audioKick ), 0.55 );
    vec3  glow_tint = vec3( 1.4, 1.1, 1.7 ) * edge_glow;

    vec3 bg_col = imgPalette( length( uv ) * 0.4 + 0.2 ) * ( 0.2 + 0.15 * audioLevel );
    vec3 final_col = mix( bg_col, hit_col, clamp( length( hit_col ), 0.0, 1.0 ) );
    final_col += glow_tint;

    final_col = pow( final_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
