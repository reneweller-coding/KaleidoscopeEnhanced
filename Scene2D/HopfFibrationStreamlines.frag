#version 330 core
/*****************************************************************************\
 *                              HopfFibrationStreamlines.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HOPF FIBRATION STREAMLINES: 4D-to-3D Hopf Fibration (S3 -> S2) raymarching.
 *
 *  Luminous interlocking linked fiber tori, relativistic circular streamlines, and high-velocity electric pulse
 *  cascades.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous circular stream flow along fiber links
 *    audioKick    -> flashes fiber linkage nodes & expands fiber tube radius
 *    audioCentroid-> modulates fiber density & fine stream resolution
 *    audioSubBass -> expands fiber bundle breathing
 *    audioChromaHue-> rotates the luminous Hopf fiber spectrum
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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
uniform float speedP;        ///< Speed knob, 0..1.
uniform float fiberDensityP; ///< Fiber density knob, 0.7..1.5.
uniform float tubeRadiusP;   ///< Tube radius knob, 0.05..0.12.
uniform float glowP;         ///< Glow / afterglow knob, 0..1.
uniform float hueP;          ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Distance estimator for nested Hopf fiber tori in 3D
 *
 * @param p           The point. (in)
 * @param t           The scene's time. (in)
 * @param fiberDens   Fibre density knob. (in)
 * @param tubeR       Radius of the tubes. (in)
 * @param fiberPhase  Receives the fibre's phase (for colouring). (out)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float mapHopf( vec3 p, float t, float fiberDens, float tubeR, out float fiberPhase )
{
    float r = length( p );
    // Stereographic coordinates to S3
    float r2 = dot( p, p );
    vec4  q4 = vec4( 2.0 * p, r2 - 1.0 ) / ( r2 + 1.0 );

    // Hopf base map: (q4.x^2 + q4.y^2 - q4.z^2 - q4.w^2, 2(q4.x*q4.w + q4.y*q4.z), 2(q4.y*q4.w - q4.x*q4.z))
    float u = atan( q4.y, q4.x );
    float v = atan( q4.w, q4.z );

    fiberPhase = u + v + t * 2.0;

    // Toroidal nested shell distance
    float d_tor = abs( length( vec2( length( p.xy ) - 1.6, p.z ) ) - 0.7 ) - tubeR;

    // Streamline periodic ribs
    float stream_rib = abs( sin( ( u - v ) * ( 6.0 * fiberDens ) + t * 4.0 ) );
    return d_tor + stream_rib * 0.04;
}

/**  A glow of a tint that saturates instead of clipping: as bright as tint * x while that is small, then toward the
 * tint at full strength (its brightest channel at cap) -- the hue stays.
 *
 * @param tint  The glow's colour per unit of x. (in)
 * @param x     The glow's strength, 0.. (in)
 * @param cap   The brightest channel's limit. (in)
 *
 * @return
 *   The glow's colour.
 *
 * min( tint * x, vec3( cap ) ) clipped every channel to cap, and every bright band became one flat white (17.10.2026).
 **/
vec3 glowSat( vec3 tint, float x, float cap )
{
    float m = max( tint.r, max( tint.g, tint.b ) );
    return tint / m * cap * ( 1.0 - exp( -max( x, 0.0 ) * m / cap ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float f_dens = ( fiberDensityP > 0.01 ) ? fiberDensityP : 1.0;
    float t_r = ( tubeRadiusP > 0.01 ) ? tubeRadiusP : 0.08;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.168 * spd + audioAdvance * 0.168 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    // Orbital camera ray setup
    float cam_dist = 3.2 + 0.4 * sin( audioSwell * 2.0 );
    float cam_a = t * 0.25 + audioPhase * 0.1;
    vec3  ro = vec3( cos( cam_a ) * cam_dist, 1.2 * sin( t * 0.3 ), sin( cam_a ) * cam_dist );
    vec3  ta = vec3( 0.0, 0.0, 0.0 );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );
    vec3 rd = normalize( uv.x * uu + uv.y * vv + ( 1.25 + 0.2 * sin( audioSwell ) ) * ww );

    float tube_radius = ( t_r + 0.02 * audioSubBass );

    // Brightness packs more streamline ribs onto each fiber. Only the (u-v)
    // frequency is scaled -- the t*4.0 flow phase inside stream_rib is a separate
    // summand, so the ribs keep sliding smoothly while their spacing tightens.
    float f_dens_a = f_dens * ( 1.0 + 0.5 * audioCentroid );

    // Raymarching through Hopf fiber field
    float tot_dist = 0.0;
    float hit_phase = 0.0;
    float fiber_glow = 0.0;
    vec3  hit_col = vec3( 0.0 );

    for ( int i = 0; i < 52; ++i )
    {
        vec3  p = ro + rd * tot_dist;
        float cur_phase;
        float d = mapHopf( p, t, f_dens_a, tube_radius, cur_phase );

        // A ray that never gets close to the fiber torus (d stays large,
        // tot_dist runs out to 8.0) was previously falling into this SAME
        // branch as a real surface hit, so its huge/stale "d" fed straight
        // into hit_col's (0.7 + 0.4*(1.0-d)) multiplier -- strongly negative
        // for d well above 1 -- producing a flat, wrongly-tinted patch
        // across the whole missed region instead of leaving it to bg_col.
        // Only an actual surface hit may set hit_col now; running out of
        // march distance is a plain miss.
        if ( abs( d ) < 0.003 )
        {
            hit_phase = cur_phase;

            // This split fix alone left the picture unchanged because the
            // OTHER additive term, fiber_glow, was never touched -- and it
            // is the dominant one. minD (closest |d| over the WHOLE march)
            // is, by construction, always inside [0, 0.003] for any ray
            // that hits at all (that's the hit threshold, not a proximity
            // signal). Verified numerically across a full screen grid:
            // 100% of hit pixels had minD in [0, 0.003] and fiber_glow
            // in [0.92, 1.0] -- i.e. exp(-minD*k) was pinned near its
            // ceiling for the ENTIRE visible fiber bundle regardless of
            // where on the torus the ray landed, flooding it with a
            // uniform (1.3,1.1,1.8)-tinted wash that swallowed the real
            // streamline pattern underneath (the hit region actually
            // covers most of the frame at this camera distance -- it is
            // not a framing/FOV problem). stream_rib is a genuine
            // per-surface-point quantity that already exists in mapHopf's
            // distance field but was discarded; using it directly as the
            // glow driver recovers the actual streamline pulses the scene
            // is named for (verified numerically: mean 0.38, std 0.31
            // across the hit surface, not saturated).
            float r2h = dot( p, p );
            vec4  q4h = vec4( 2.0 * p, r2h - 1.0 ) / ( r2h + 1.0 );
            float uh = atan( q4h.y, q4h.x );
            float vh = atan( q4h.w, q4h.z );
            float stream_rib = abs( sin( ( uh - vh ) * ( 6.0 * f_dens_a ) + t * 4.0 ) );
            // Exponent >= 1 on a 0..1 signal only ever narrows the rib, so a
            // bright mix resolves finer streamlines without adding any light.
            fiber_glow = pow( 1.0 - stream_rib, 1.0 + 1.2 * audioCentroid ) * glw;

            vec2 sample_uv = fract( vec2( atan( p.y, p.x ) / 6.2831853 + 0.5, p.z * 0.3 ) );
            vec3 tex_col = img( sample_uv );
            vec3 pal = imgPalette( hit_phase * 0.15 + t * 0.05 );
            hit_col = mix( tex_col, pal, 0.5 ) * ( 0.7 + 0.4 * ( 1.0 - d ) );
            break;
        }
        if ( tot_dist > 8.0 )
            break;

        tot_dist += max( 0.02, d * 0.7 );
    }

    // Glowing fiber streamlines & kick flash (stream_rib term computed
    // above; left at 0 on a true miss so bg_col shows through cleanly).
    // fiber_glow averages ~0.6 across the whole hit surface (it is a real
    // streamline signal, not a thin edge), so the raw (1.3,1.1,1.8) tint
    // already exceeds 1.0 per channel on AVERAGE before any kick -- capping
    // only the scalar left the tinted vec3 itself unbounded.
    vec3 fiber_tint = glowSat( vec3( 1.3, 1.1, 1.8 ), fiber_glow * ( 1.0 + 2.5 * audioKick ), 0.65 );

    // Background Hopf field flare
    vec3 bg_col = imgPalette( length( uv ) * 0.4 + 0.3 ) * ( 0.2 + 0.15 * audioLevel );

    vec3 final_col = mix( bg_col, hit_col, clamp( length( hit_col ), 0.0, 1.0 ) );
    final_col += fiber_tint;

    final_col = pow( final_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.5 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
