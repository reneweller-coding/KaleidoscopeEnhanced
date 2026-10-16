#version 330 core
/*****************************************************************************\
 *                              PrismaticCrystalChamber4D.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PRISMATIC CRYSTAL CHAMBER 4D: Raymarching within a 4-dimensional hyper-polychoron with spectral dispersion,
 *  multi-facet reflections, and high-velocity SO(4) isoclinic double rotations.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous 4D double rotation plane progression
 *    audioKick    -> flashes internal laser nodes & expands facet clearance
 *    audioCentroid-> modulates chromatic dispersion spread
 *    audioSubBass -> expands the hyper-chamber chamber breathing
 *    audioChromaHue-> steers the prism spectrum rotation
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
uniform float speedP;      ///< Speed knob, 0..1.
uniform float facetP;      ///< Facet knob, 0.7..1.5.
uniform float dispersionP; ///< Dispersion knob, 0.8..1.6.
uniform float glowP;       ///< Glow / afterglow knob, 0..1.
uniform float hueP;        ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  4D Rotation matrix along two orthogonal planes (XY and ZW)
 *
 * @param p   The 4-vector. (in)
 * @param a1  Angle in the xy plane. (in)
 * @param a2  Angle in the zw plane. (in)
 *
 * @return
 *   The rotated 4-vector.
 **/
vec4 rotate4D( vec4 p, float a1, float a2 )
{
    float c1 = cos( a1 ), s1 = sin( a1 );
    float c2 = cos( a2 ), s2 = sin( a2 );
    vec4  q = p;
    // Plane 1: XY
    q.xy = vec2( c1 * p.x - s1 * p.y, s1 * p.x + c1 * p.y );
    // Plane 2: ZW
    q.zw = vec2( c2 * p.z - s2 * p.w, s2 * p.z + c2 * p.w );
    return q;
}

/**  Distance estimator for 4D Polychoron (Hyper-Octahedron / 16-Cell & 24-Cell cross-section)
 *
 * @param p      The point (4D). (in)
 * @param facet  Facet knob. (in)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float map4D( vec4 p, float facet )
{
    vec4 q = abs( p );
    // Sub-bass breathes the chamber open. These constants are pure facet
    // OFFSETS, so scaling them moves every wall outward together without
    // touching the estimator's Lipschitz bound -- the march stays conservative.
    float grow = 1.0 + 0.25 * audioSubBass;
    // 16-Cell SDF in 4D: (sum |x_i|) - R
    float d16 = ( q.x + q.y + q.z + q.w - 2.2 * grow ) * 0.5;
    // Hypercube bounds
    float d_box = max( max( q.x, q.y ), max( q.z, q.w ) ) - 1.35 * grow;
    // Intersection of 24-cell facets
    float d24 = max( d16, ( max( q.x + q.y, q.z + q.w ) - 1.8 * grow ) * 0.7071 );
    return mix( d24, d_box, facet * 0.4 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float fct = ( facetP > 0.01 ) ? facetP : 1.0;
    float disp = ( dispersionP > 0.01 ) ? dispersionP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).
    float rot1 = t * 0.4 + audioPhase * 0.15;
    float rot2 = t * 0.27 + audioSwell * 0.5;

    // Ray setup in 3D, projected into 4D with W coordinate based on focal length
    vec3 ro3 = vec3( 0.0, 0.0, -3.6 + 0.3 * sin( t * 0.5 ) );
    vec3 rd3 = normalize( vec3( uv, 1.25 + 0.25 * sin( audioSwell * 2.0 ) ) );

    vec3  acc_col = vec3( 0.0 );
    float glow_acc = 0.0;

    // Multi-spectral chromatic raymarch (R, G, B channels slightly refracted)
    vec3 wavelengths = vec3( 0.97, 1.0, 1.03 ) * ( 1.0 + 0.15 * ( audioCentroid + audioFlux ) * disp );

    for ( int c = 0; c < 3; ++c )
    {
        float wl = ( c == 0 ) ? wavelengths.r : ( ( c == 1 ) ? wavelengths.g : wavelengths.b );
        vec3  rd = normalize( rd3 * vec3( wl, wl, 1.0 ) );
        vec3  ro = ro3;

        // Near clip: the polychoron rotating through W periodically
        // sweeps a cell over the camera; without this the whole frame
        // collapsed to one flat colour sample whenever that happened.
        float total_dist = 0.65;
        float min_d = 1e4;
        vec3  col_channel = vec3( 0.0 );

        for ( int i = 0; i < 48; ++i )
        {
            vec3 pos3 = ro + rd * total_dist;
            // Embed 3D point into 4D hyperspace with oscillating 4th dimension
            vec4 pos4 = vec4( pos3, sin( total_dist * 0.8 + t * 0.6 ) * 0.85 );
            pos4 = rotate4D( pos4, rot1, rot2 );

            float d = map4D( pos4, fct );
            min_d = min( min_d, abs( d ) );

            if ( abs( d ) < 0.003 || total_dist > 8.0 )
            {
                // Surface hit: compute normal in 4D & reflect
                vec4  n4;
                float eps = 0.005;
                n4.x = map4D( pos4 + vec4( eps, 0, 0, 0 ), fct ) - map4D( pos4 - vec4( eps, 0, 0, 0 ), fct );
                n4.y = map4D( pos4 + vec4( 0, eps, 0, 0 ), fct ) - map4D( pos4 - vec4( 0, eps, 0, 0 ), fct );
                n4.z = map4D( pos4 + vec4( 0, 0, eps, 0 ), fct ) - map4D( pos4 - vec4( 0, 0, eps, 0 ), fct );
                n4.w = map4D( pos4 + vec4( 0, 0, 0, eps ), fct ) - map4D( pos4 - vec4( 0, 0, 0, eps ), fct );
                n4 = normalize( n4 );

                vec2 uv_map = fract( pos4.xy * 0.4 + pos4.zw * 0.4 + 0.5 );
                vec3 surf_col = img( uv_map ) * imgPalette( dot( pos4, vec4( 0.2, 0.3, 0.4, 0.1 ) ) );
                col_channel = surf_col * ( 0.6 + 0.4 * abs( n4.z ) );
                break;
            }

            total_dist += max( 0.02, d * 0.65 );
        }

        // Volumetric facet edge glow -- min_d tracks the closest approach
        // over the ENTIRE march for this dispersion channel, so it reads
        // near-zero for almost any ray landing inside the polychoron's
        // octagonal silhouette (which the facets nearly fill from this
        // camera distance), not just true facet-edge hits. Left uncapped
        // this saturated the additive tint across the whole interior,
        // clipping to white; only rays that actually miss the shape
        // (outside the octagon) kept a large min_d and stayed dark.
        float edge_glow = exp( -min_d * ( 24.0 + 10.0 * audioCentroid ) ) * glw;
        edge_glow = min( edge_glow, 0.45 );
        vec3 spectral_tint = ( c == 0 ) ? vec3( 1.2, 0.3, 0.2 )
                                        : ( ( c == 1 ) ? vec3( 0.2, 1.2, 0.4 ) : vec3( 0.3, 0.5, 1.4 ) );

        acc_col += ( col_channel + edge_glow * spectral_tint * ( 1.0 + 2.0 * audioKick ) ) * 0.3333;
        glow_acc += edge_glow * 0.3333;
    }

    // Dynamic background flare
    vec3 bg_col = imgPalette( length( uv ) * 0.5 + t * 0.1 ) * 0.25;
    vec3 final_col = mix( bg_col, acc_col, clamp( length( acc_col ), 0.0, 1.0 ) );

    // Center flare tint -- glow_acc is already bounded by the edge_glow cap
    // above, but audioSwell itself is an unbounded audio-energy scalar
    // (used raw elsewhere in this file), so cap its contribution here too
    // rather than letting a strong swell alone blow this additive term out.
    final_col += vec3( 0.1, 0.15, 0.25 ) * glow_acc * min( audioSwell, 1.5 );

    // Contrast & saturation enhancement with a soft-knee compression so
    // the facet-edge glow compresses gracefully instead of clipping
    // straight to white.
    final_col = pow( final_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
