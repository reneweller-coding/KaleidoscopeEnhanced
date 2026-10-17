#version 330 core
/*****************************************************************************\
 *                              RecursiveTesseractZoomAbyss.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  RECURSIVE TESSERACT ZOOM ABYSS: Infinite recursive 4D hypercube dive.
 *
 *  Successive nested tesseract cell portals unfold, collapse past the camera, and unleash glowing multidimensional
 *  laser wireframes with dimensional flashes.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous forward plunge through 4D hypercube cells
 *    audioKick    -> triggers dimension-crossing portal flashes & edge burst
 *    audioCentroid-> modulates 4D rotation hyper-plane speed
 *    audioSubBass -> expands tesseract frame breathing
 *    audioChromaHue-> steers the recursive hypercube spectrum
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
uniform float speedP; ///< Speed knob, 0..1.
uniform float depthP; ///< Depth knob, 0..1.
uniform float wireP;  ///< Wire knob, 0.7..1.4.
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

/**  Overall level of the photo currently on the texture units, from a fixed 5-tap grid.
 *
 * @return
 *   The photo's average level, 0..1.
 *
 * Every base colour here is photo-derived and the accumulator below sums up to six of them, so a bright photo pushed
 * the frame to a uniform white wash with no readable hypercube structure. The probe rides the tex0/tex1 crossfade so
 * the gain can never pop, and one number per frame moves exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/**  4D Box distance estimator
 *
 * @param p  The point (4D). (in)
 * @param b  Half size of the box. (in)
 *
 * @return
 *   The signed distance.
 **/
float sdBox4D( vec4 p, vec4 b )
{
    vec4 d = abs( p ) - b;
    return min( max( max( d.x, d.y ), max( d.z, d.w ) ), 0.0 ) + length( max( d, 0.0 ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float dpth = ( depthP > 0.01 ) ? depthP : 1.0;
    float wire_w = ( wireP > 0.01 ) ? wireP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    // The dive only advanced on audioAdvance (~0.25 units/s on quiet material),
    // so the plunge was effectively frozen. Constant base rate + audio surge; the
    // coefficient on `time` is a per-activation constant, so anti-flicker safe.
    float t = time * 0.34 * spd + audioAdvance * 0.32 * spd;

    // Logarithmic scale dive for infinite zoom through tesseract layers
    float zoom_speed = t * 0.8;
    float cell_phase = mod( zoom_speed, 1.0 );

    vec3  col_acc = vec3( 0.0 );
    float glow_acc = 0.0;
    float w_sum = 0.0;

    // Sum over multiple nested recursive 4D tesseract frames.
    // The old log step of 1.1 put successive frames a factor e^1.1 = 3.0 apart, so
    // only ONE nested square ever landed inside the visible band and everything
    // else collapsed into a knot of hairlines at the centre - a small motif on a
    // big empty field. A step of 0.62 (factor 1.86) with more layers puts four to
    // five frames across the screen at once, which is the same infinite dive, just
    // actually filling it.
    for ( int k = 0; k < 9; ++k )
    {
        float kf = float( k );
        float layer_scale = exp( ( kf - cell_phase ) * 0.62 ) * dpth;
        float layer_fade = smoothstep( 0.0, 0.3, kf - cell_phase ) * smoothstep( 8.6, 6.0, kf - cell_phase );

        if ( layer_fade <= 0.001 )
            continue;

        vec2 p_layer = uv * layer_scale;

        // 4D Rotation angles. Brightness may not scale the accumulated angle
        // itself (that would remap the whole phase in one frame); it rides on
        // top as a bounded extra offset, so a rising centroid still swings the
        // hyper-plane forward -- i.e. it adds to the rotation RATE for as long
        // as the timbre keeps brightening, then relaxes.
        float rot_xy = t * 0.2 + kf * 0.4 + 0.8 * audioSwell;
        float rot_zw = t * 0.15 + audioPhase * 0.1 + 0.6 * audioSwell;

        // Project 2D screen into 4D tesseract coordinates
        vec4 p4 = vec4( p_layer, sin( kf * 1.2 + t * 0.4 ), cos( kf * 1.2 + t * 0.4 ) );

        // 4D Rotations
        float c1 = cos( rot_xy ), s1 = sin( rot_xy );
        p4.xy = vec2( c1 * p4.x - s1 * p4.y, s1 * p4.x + c1 * p4.y );
        float c2 = cos( rot_zw ), s2 = sin( rot_zw );
        p4.zw = vec2( c2 * p4.z - s2 * p4.w, s2 * p4.z + c2 * p4.w );

        // Sub-bass swells the frame's half-extent. It is a plain per-frame
        // size parameter (no accumulated phase runs through it), so it can
        // breathe freely -- unlike the rotation angles above.
        float frame_r = 1.2 * ( 1.0 + 0.32 * audioSubBass );

        // Compute distance to 4D wireframe edges
        vec4  q = abs( p4 );
        float d_outer = max( max( q.x, q.y ), max( q.z, q.w ) ) - frame_r;
        float d_inner = max( max( q.x, q.y ), max( q.z, q.w ) ) - ( frame_r - 0.15 );
        float d_frame = max( d_outer, -d_inner );

        // 2D Projection edge distance for wireframe lines. The old
        // cornerDist = length(max(q2-1.2,0)) is the correct SDF for OUTSIDE
        // a box, but it is identically 0 for EVERY point still inside the
        // frame (q2.x<1.2 AND q2.y<1.2) -- not just near an actual corner.
        // min(edgeDist, cornerDist) then picked that spurious 0 over
        // edgeDist's real, positive interior falloff across the WHOLE
        // inside of the frame, on every layer, regardless of the
        // layer_scale decay-direction fix (which only reshapes falloff for
        // wire>0, i.e. outside the frame -- it can't touch a value that's
        // hard-pinned to 0 inside). Verified numerically: at screen centre
        // the summed edge_glow across active layers was a near-constant
        // ~4.0-4.6 for EVERY cell_phase, which is why the earlier fix
        // produced no visible change. edgeDist alone already gives the
        // correct thin-outline falloff both inside and outside the frame.
        // Taken from the ROTATED p4.xy, not from raw p_layer: the 4D rotation
        // above only ever fed d_frame, which nothing consumes, so the whole
        // hyper-plane spin was invisible and no audio mapping on it could show.
        vec2  q2 = abs( p4.xy );
        float wire = min( abs( q2.x - frame_r ), abs( q2.y - frame_r ) );

        // `wire` is measured in LAYER units and spans roughly 0..1.3, while the
        // old decay constant was 25*layer_scale*0.15 = 0.4..3.8. exp() of that
        // never actually decays: every pixel of every layer returned 0.1..1.0,
        // six layers summed past 1.0, and min(glow_acc,1.0) then pinned the whole
        // frame to full-intensity wire_tint -- a flat white-violet flood with no
        // wires visible in it at all.
        // Converting to SCREEN units (p_layer = uv*layer_scale, so screen distance
        // is wire/layer_scale) gives a line of constant on-screen thickness, and a
        // decay constant matched to that range makes it an actual thin edge.
        float wire_screen = wire / max( layer_scale, 1e-4 );
        // 78 rather than 46: the layer count went from 6 to 9 above, so the same
        // line width would have put half again as much lit area on screen and the
        // capped glow sum would flatten out into a solid violet field. Thinner
        // lines, more of them -- which is what a receding hypercube stack is.
        float edge_glow = exp( -wire_screen * ( 78.0 / wire_w ) ) * layer_fade * glw;

        // Sample texture inside the tesseract cell face
        vec2 sample_uv = fract( p_layer * 0.25 + 0.5 );
        vec3 tex_col = img( sample_uv );
        vec3 pal_col = imgPalette( kf * 0.2 + t * 0.1 );

        // Depth shading: near cells bright, far cells sinking into the abyss.
        // Six equally-lit layers averaged to one flat mid-level.
        // (exponent rescaled with the smaller log step above so the dive still
        // fades over the same physical depth, not over the same layer index)
        float depth_shade = exp( -( kf - cell_phase ) * 0.31 );
        // Deep layers are sampled at p_layer = uv * layer_scale with layer_scale up
        // to ~145, i.e. the photo tiles dozens of times across the frame and
        // aliases into its own average -- a flat wash that swamps the near
        // layers. Only the resolvable octaves carry a photo crop; the far ones
        // contribute the flat palette tone.
        float resolvable = smoothstep( 4.6, 1.6, kf - cell_phase );
        vec3  cell_col = mix( pal_col, tex_col, 0.55 * resolvable );
        float w = layer_fade * depth_shade;
        col_acc += cell_col * w;
        w_sum += w;

        glow_acc += edge_glow;
    }

    // Weighted average rather than a raw sum: nine layers of a bright photo used
    // to stack straight past white (measured luma 0.823 at contrast 0.012 - one
    // flat wash). Normalising keeps the depth ordering while bounding exposure.
    col_acc /= max( w_sum, 1e-3 );
    col_acc *= 0.62 * clamp( 0.40 / max( 0.06, photoLevel() ), 0.55, 1.70 );

    // Add glowing hypercube wireframe lines once, from the TOTAL glow
    // accumulated across layers (capped) rather than per-layer -- several
    // octaves' frames can still overlap near true wire crossings, and an
    // uncapped per-layer add let those crossings stack past white.
    vec3 wire_tint = min( vec3( 1.3, 1.0, 1.8 ) * min( glow_acc, 1.2 ) * ( 1.0 + 2.0 * audioKick ),
                          vec3( 1.0, 0.85, 1.0 ) );
    col_acc += wire_tint;

    // Portal dimension crossing flash (when cell_phase wraps around)
    float portal_flash = pow( max( 0.0, 1.0 - abs( cell_phase - 0.5 ) * 4.0 ), 4.0 ) * ( 0.4 + 1.2 * audioKick );
    col_acc += min( imgPalette( 0.7 ) * portal_flash, vec3( 0.55 ) );

    col_acc = pow( min( col_acc, vec3( 1.0 ) ), vec3( 0.88 ) );
    // Soft knee on top of the hard cap: pow(x, 0.88) lifts the midtones, so a
    // wire crossing landing on an already-lit cell face still stacked flat
    // against the ceiling. The knee bends those crests over instead.
    vec3 cat_tone = clamp( col_acc, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.26 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
