#version 330 core
/*****************************************************************************\
 *                              KaleidoscopicBismuthLattice.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  KALEIDOSCOPIC BISMUTH LATTICE: Right-angled stepped hopper crystal Bismuth labyrinth (L1-norm Manhattan KIFS)
 *  with iridescent thin-film rainbow interference, 12-fold rotational symmetry, and glowing metallic hopper steps.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous Bismuth hopper step growth & rotation
 *    audioKick    -> flashes iridescent rainbow oxide films & expands step edges
 *    audioCentroid-> sharpens right-angled staircase step density
 *    audioSubBass -> expands hopper cavity depth breathing
 *    audioChromaHue-> rotates the metallic thin-film interference spectrum
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
uniform float speedP;       ///< Speed knob, 0..1.
uniform float stepsP;       ///< Steps knob, 0.7..1.4.
uniform float iridescenceP; ///< Iridescence knob, 0.8..1.5.
uniform float glowP;        ///< Glow / afterglow knob, 0..1.
uniform float hueP;         ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Distance estimator for Bismuth hopper crystals (stepped cubic KIFS)
 *
 * @param p          The point. (in)
 * @param t          The scene's time. (in)
 * @param nSteps     Hopper step knob. (in)
 * @param stepLevel  Receives the step level (for colouring). (out)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float mapBismuth( vec3 p, float t, float nSteps, out float stepLevel )
{
    vec3 q = p;
    stepLevel = 0.0;

    for ( int i = 0; i < 6; ++i )
    {
        // Absolute cubic fold
        q = abs( q );
        if ( q.x < q.y )
            q.xy = q.yx;
        if ( q.x < q.z )
            q.xz = q.zx;
        if ( q.y < q.z )
            q.yz = q.zy;

        // Stepped hopper offset. Brightness pulls the offsets in, which packs
        // more terraces into the same screen area -- the fold scale (1.45) is
        // deliberately left alone: it also normalises the DE below, so audio on
        // it would shorten every march step and starve the 52-iteration loop.
        float step_dens = 1.0 - 0.18 * audioCentroid;
        q.x -= 0.65 * step_dens;
        q.y -= 0.45 * step_dens;
        q.z -= 0.35 * step_dens;

        // Scale
        q *= 1.45;
        stepLevel += dot( q, q ) * 0.1;
    }

    // Manhattan box step edge distance. A smaller box radius on sub-bass sinks
    // the hopper pits deeper into each terrace (still an exact box DE, just for
    // the shrunken box), so drones breathe the cavity depth.
    float d_box = max( max( q.x, q.y ), q.z ) - ( 1.2 - 0.2 * audioSubBass );
    return d_box / pow( 1.45, 6.0 );
}

/**  Same field, evaluated from a WORLD-space point (applies the identical crystal-rotation transform the main march
 * uses) so it can be finite- differenced for a world-space surface normal.
 *
 * @param pw  The point in world space. (in)
 * @param t   The scene's time. (in)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float mapBismuthWorld( vec3 pw, float t )
{
    float cs = cos( t * 0.2 ), sn = sin( t * 0.2 );
    pw.xz = mat2( cs, -sn, sn, cs ) * pw.xz;
    float dummy;
    return mapBismuth( pw, t, 0.0, dummy );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float n_st = ( stepsP > 0.01 ) ? stepsP : 1.0;
    float irid = ( iridescenceP > 0.01 ) ? iridescenceP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.168 * spd + audioAdvance * 0.168 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // 12-Fold radial kaleidoscope fold
    float a = atan( uv.y, uv.x );
    float r = length( uv );
    float seg = 3.14159265 / 6.0;
    a = mod( a + seg * 0.5, seg ) - seg * 0.5;
    a = abs( a );
    vec2 p_fold = vec2( cos( a ), sin( a ) ) * r;

    // Camera setup looking into the Bismuth hopper cavern -- ONE shared
    // origin with the fold only steering ray DIRECTION. Folding p_fold into
    // the origin too gave every pixel its own camera position correlated
    // with its own ray, so most rays started already touching the (equally
    // p_fold-symmetric) crystal -- an instant, near-uniform hit.
    // cam_dist=2.4 still sat almost exactly ON the crystal surface (|d|~0.01
    // at the shared origin) for large stretches of the rotation -- since
    // every ray's FIRST sample is taken at that shared point (tot_dist=0),
    // rays could converge to a near-instant, direction-independent hit.
    // 3.6 keeps the origin robustly outside the lattice so each ray's
    // march is actually its own (the flat-interior glow bug itself turned
    // out to be a separate, deeper issue -- see the Fresnel rim comment
    // below).
    float cam_dist = 3.6 + 0.3 * sin( audioSwell * 2.0 );
    vec3  ro = vec3( 0.0, 0.0, -cam_dist );
    vec3  rd = normalize( vec3( p_fold, 1.25 ) );

    // Raymarching
    float tot_dist = 0.0;
    float hit_step = 0.0;
    float step_glow = 0.0;
    vec3  hit_col = vec3( 0.0 );

    for ( int i = 0; i < 52; ++i )
    {
        vec3 p_world = ro + rd * tot_dist;
        vec3 p = p_world;

        // Slow rotation of crystal inside
        float cs = cos( t * 0.2 ), sn = sin( t * 0.2 );
        p.xz = mat2( cs, -sn, sn, cs ) * p.xz;

        float cur_step;
        float d = mapBismuth( p, t, n_st, cur_step );

        // A cam_dist increase alone can't fix a flat interior: minD (closest
        // |d| over the WHOLE march) is, by construction, always inside
        // [0, hit-threshold] for any ray that actually hits -- that's what
        // "hit" means, not an edge/proximity signal. Verified numerically:
        // for pixels that hit, minD sat in [0, 0.002] 100% of the time
        // regardless of camera distance, so exp(-minD*k) saturated near its
        // ceiling across the ENTIRE lattice interior no matter how steep k
        // was made; only true misses (which range wider) ever varied. The
        // decay-steepen pass could therefore only ever sharpen the outer
        // ring where rays graze past the lattice, never the solid interior.
        // A Fresnel-style grazing-angle term from the actual surface normal
        // varies correctly across flat faces vs. sharp lattice edges
        // (confirmed numerically: real spread from ~0 to ~0.88 across the
        // hit surface, not a saturated constant).
        if ( abs( d ) < 0.002 )
        {
            hit_step = cur_step;

            vec2 eps = vec2( 0.001, 0.0 );
            vec3 nrm = normalize( vec3(
                mapBismuthWorld( p_world + eps.xyy, t ) - mapBismuthWorld( p_world - eps.xyy, t ),
                mapBismuthWorld( p_world + eps.yxy, t ) - mapBismuthWorld( p_world - eps.yxy, t ),
                mapBismuthWorld( p_world + eps.yyx, t ) - mapBismuthWorld( p_world - eps.yyx, t ) ) );
            step_glow = pow( 1.0 - abs( dot( nrm, -rd ) ), 3.0 ) * glw;

            // Thin-film oxide rainbow interference based on step depth
            vec3 thin_film = vec3(
                                 sin( hit_step * 4.0 * irid + t * 2.0 ),
                                 sin( hit_step * 4.0 * irid + t * 2.0 + 2.094 ),
                                 sin( hit_step * 4.0 * irid + t * 2.0 + 4.188 ) )
                                 * 0.5
                             + 0.5;

            vec2 sample_uv = fract( p.xy * 0.4 + 0.5 );
            vec3 tex_col = img( sample_uv );
            vec3 pal = imgPalette( hit_step * 0.2 + 0.1 );

            hit_col = mix( tex_col, pal, 0.4 ) * thin_film * ( 0.8 + 0.4 * ( 1.0 - d ) );
            break;
        }
        if ( tot_dist > 6.0 )
            break;

        tot_dist += max( 0.015, d * 0.7 );
    }

    // Glowing stepped hopper edges (rim-lit via the Fresnel term computed
    // above; left at 0 on a true miss so bg_col shows through cleanly).
    vec3 glow_tint = vec3( 1.4, 1.2, 1.7 ) * step_glow * ( 1.0 + 2.5 * audioKick );

    vec3 bg_col = imgPalette( r * 0.5 + 0.3 ) * ( 0.2 + 0.15 * audioLevel );
    vec3 final_col = mix( bg_col, hit_col, clamp( length( hit_col ), 0.0, 1.0 ) );
    final_col += glow_tint;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
