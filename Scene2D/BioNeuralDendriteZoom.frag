#version 330 core
/*****************************************************************************\
 *                              BioNeuralDendriteZoom.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  BIO NEURAL DENDRITE ZOOM: Microscopic continuous dive through a dense bioluminescent neural axon arborization.
 *
 *  Luminous synaptic vesicles, action potentials firing like high-voltage electric pulses along dendrites, and
 *  glowing soma cell bodies.
 *
 *  Audio Reactivity:
 *    audioAdvance -> surges the forward plunge along the axon on top of a steady flight
 *    audioKick    -> flashes synaptic neurotransmitter bursts & triggers action potential
 *    audioCentroid-> tightens the axon halo around rays that miss the arborization
 *    audioSubBass -> expands soma neuron cell body diameter breathing
 *    audioSwell   -> field of view of the dive
 *    audioLevel   -> brightness of the neuropil behind the branches
 *    audioChromaHue-> rotates the bioluminescent neural bio-fluorescence spectrum
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
uniform float speedP;      ///< Speed knob, 0..1.
uniform float branchP;     ///< Branching knob, 0..1.
uniform float pulseSpeedP; ///< Pulse speed knob, 0.7..1.5.
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

/**  Overall level of the photo currently on the texture units, from a fixed 5-tap grid.
 *
 * @return
 *   The photo's average level, 0..1.
 *
 * Every base colour here is photo-derived, so a bright photo left the action-potential and axon glows no headroom at
 * all. The probe rides the tex0/tex1 crossfade, so the gain it feeds can never pop, and being one number for the whole
 * frame it rescales exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/// World scale of the arborization. At 1.0 the tube lattice sat so close to
/// the flight path that the median ray landed 0.14 units from the camera --
/// one unlit tube wall filling the whole frame, which is exactly why the
/// picture read as a single flat bright field. Building the lattice in a
/// half-scale coordinate (and converting the distance back with the same
/// factor, so the estimator stays correct) doubles the tube spacing AND the
/// tube radius: the median hit now sits at 0.62 with a p95 of 2.5, so there is
/// a real depth range for the light to fall off across.
const float NeuralWs = 0.5;

/**  Distance estimator for neural dendrite branching
 *
 * @param p            The point. (in)
 * @param t            The scene's time. (in)
 * @param brMod        Branching knob. (in)
 * @param synapseNode  Receives the glow of the nearest synapse. (out)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float mapNeural( vec3 p, float t, float brMod, out float synapseNode )
{
    vec3  q = p * NeuralWs;
    float d = 1e5;
    synapseNode = 0.0;

    float dend_scale = 1.0;
    for ( int i = 0; i < 4; ++i )
    {
        // Absolute fold with rotation
        q = abs( q ) - vec3( 0.4, 0.4, 0.6 );
        float cs = cos( 0.5 + t * 0.1 ), sn = sin( 0.5 + t * 0.1 );
        q.xy = mat2( cs, -sn, sn, cs ) * q.xy;

        // Normalise by the scale accumulated SO FAR, not by the loop's
        // final total: dividing every iteration's distance by the same
        // fixed pow(1.45,4) over-shrinks whichever early iteration actually
        // produced the minimum, making the raymarcher hit one step off the
        // camera for nearly every ray -- a flat wash instead of branching
        // dendrites.
        float d_branch = ( length( q.xy ) - 0.05 * ( 1.0 + 0.2 * sin( audioSubBass ) ) ) / dend_scale;
        d = min( d, d_branch );

        synapseNode += exp( -length( q ) * 8.0 );
        q *= 1.45 * brMod;
        dend_scale *= 1.45 * brMod;
    }

    return d / NeuralWs;
}

/**  Surface normal by the 4-tap tetrahedron trick -- the arborization had NO surface shading at all before (the only
 * depth term, 0.6 + 0.4*(1.0-d), is evaluated at the hit where d is the 0.003 epsilon, i.e. a constant 0.999), so
 * every lit tube came out the same brightness no matter which way it faced.
 *
 * @param p      The surface point. (in)
 * @param t      The scene's time. (in)
 * @param brMod  Branching knob. (in)
 *
 * @return
 *   The unit normal.
 **/
vec3 neuralNormal( vec3 p, float t, float brMod )
{
    const vec2  k = vec2( 1.0, -1.0 );
    const float e = 0.0025;
    float       s;
    vec3        g = k.xyy * mapNeural( p + k.xyy * e, t, brMod, s )
                    + k.yyx * mapNeural( p + k.yyx * e, t, brMod, s )
                    + k.yxy * mapNeural( p + k.yxy * e, t, brMod, s )
                    + k.xxx * mapNeural( p + k.xxx * e, t, brMod, s );
    // Guarded, not normalize(): a miss leaves hit_p at the origin and a
    // degenerate gradient there would hand back NaN, which mix() propagates
    // even when the hit mask is zero (NaN * 0.0 is still NaN).
    return g / max( length( g ), 1e-6 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float br = ( branchP > 0.01 ) ? branchP : 1.0;
    float p_spd = ( pulseSpeedP > 0.01 ) ? pulseSpeedP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    // audioAdvance integrates at only ~0.1 units/s, far too slow to carry a
    // "continuous dive" on its own. A CONSTANT coefficient on `time` supplies
    // the steady plunge and the audio phase is ADDED on top (anti-flicker:
    // no audio value ever multiplies `time`).
    float t = time * 0.06 * spd + audioAdvance * 0.35 * spd;

    // Flight camera position through neural network
    vec3 ro = vec3( sin( t * 0.3 ) * 0.3, cos( t * 0.25 ) * 0.3, t * 2.2 );
    vec3 rd = normalize( vec3( uv, 1.3 ) ); // FOV-Wobble raus (unscharfer Eindruck)

    // Hold the neuropil back to a fixed dark base: a bioluminescent axon only
    // reads if the tissue around it is dark, and with a bright photo the
    // mix(tex_col, pal_col) base alone already sat near 1.0 so the firing pulses
    // had nowhere left to go.
    float exp_gain = clamp( 0.30 / max( 0.05, photoLevel() ), 0.20, 1.6 );

    // Raymarching
    float tot_dist = 0.0;
    float min_d = 1e4;
    float hit_synapse = 0.0;
    float hit_dist = 0.0;
    vec3  hit_p = vec3( 0.0 );
    // Composite on an explicit hit flag, not on length(hit_col): once the base
    // is held down to a dark exposure a legitimately dark dendrite has a short
    // colour vector, and a length() mask would fade those branches back into
    // the background.
    float hit_mask = 0.0;

    for ( int i = 0; i < 80; ++i )
    {
        vec3  p = ro + rd * tot_dist;
        float cur_synapse;
        float d = mapNeural( p, t, br, cur_synapse );
        min_d = min( min_d, abs( d ) );

        // A ray that runs past the far limit is a MISS. Flagging it as a hit
        // (the old `|| tot_dist > 8.0` inside the same branch) shaded empty
        // space with surface colour and left nothing for the background.
        if ( tot_dist > 8.0 )
            break;

        if ( abs( d ) < 0.003 )
        {
            hit_mask = 1.0;
            hit_synapse = cur_synapse;
            hit_dist = tot_dist;
            hit_p = p;
            break;
        }

        // Fine step: a 0.015 min-step against a 0.003 threshold skipped the
        // convergence and jagged every silhouette ("pixelated").
        tot_dist += max( 0.004, d * 0.8 );
    }

    // ---- SURFACE SHADING -------------------------------------------------
    // Normal + headlight + key light + inverse-square falloff. This is the
    // local light/dark separation the scene never had.
    vec3  n = neuralNormal( hit_p, t, br );
    float head = clamp( dot( -rd, n ), 0.0, 1.0 );
    float key = clamp( dot( n, vec3( 0.55, 0.66, -0.51 ) ), 0.0, 1.0 );
    float atten = 1.0 / ( 1.0 + 0.8 * hit_dist * hit_dist );
    float shade = 0.10 + 0.75 * head * atten + 0.35 * key * atten;

    // Action potential pulse firing along the axon
    float action_pulse = abs( sin( hit_p.z * 12.0 - t * 8.0 * p_spd ) );
    float pulse_glow = smoothstep( 0.82, 1.0, action_pulse );

    vec2 sample_uv = fract( hit_p.xy * 0.4 + hit_p.z * 0.2 + 0.5 );
    vec3 tex_col = img( sample_uv );
    vec3 pal_col = imgPalette( hit_p.z * 0.15 + hit_synapse * 0.3 );

    vec3 hit_col = mix( tex_col, pal_col, 0.45 ) * ( 0.9 * shade * exp_gain );

    // Luminous synaptic vesicles: hit_synapse is the accumulated exp(-|q|*8)
    // around the fold nodes, so unlike min_d it genuinely varies across the
    // surface -- squared so only the node cores light up.
    float ves = clamp( hit_synapse * 0.55, 0.0, 1.0 );
    hit_col += min( vec3( 0.9, 1.5, 1.9 ) * ( ves * ves * 0.30 ), vec3( 0.27, 0.45, 0.57 ) );
    // The tint constant exceeds 1.0 on every channel, so the TINTED vector
    // carries the cap. Gated on `head` so the pulse rides the facing surface
    // instead of painting a flat band across grazing geometry.
    hit_col += min( vec3( 1.7, 1.6, 2.0 ) * pulse_glow * head * ( 0.55 + 1.6 * audioKick ),
                    vec3( 0.68, 0.64, 0.80 ) );

    // Glowing dendrite axons -- HALO AROUND THE MISSES ONLY.
    // This was the single biggest defect in the scene: 97% of rays terminate
    // on abs(d) < 0.003, so for 97% of the frame min_d WAS the hit epsilon and
    // exp(-min_d*30) evaluated to a constant (measured p5/p50/p95 =
    // 0.916/0.954/0.995). The vec3(0.95)-capped result was therefore a
    // frame-wide additive term of luma 0.918 with a standard deviation of
    // 0.007 -- a perfectly uniform bright wash pasted over a picture whose own
    // structure had a healthy std of 0.31. That is the whole of luma 0.63 /
    // contrast 0.05 / occ 0.09. A closest-approach glow only means anything
    // for a ray that never lands, so gate it on exactly that.
    float axon_glow = exp( -min_d * ( 24.0 + 12.0 * audioCentroid ) ) * glw * ( 1.0 - hit_mask );
    vec3  glow_tint = min( vec3( 0.3, 1.4, 1.9 ) * axon_glow * 0.55 * ( 1.0 + 2.0 * audioKick ),
                           vec3( 0.15, 0.70, 0.95 ) );

    // Neuropil behind the arborization: dark cytoplasm, so the bioluminescent
    // branches read as bright strokes on it rather than being level with it.
    vec3 bg_col = imgPalette( length( uv ) * 0.4 + 0.1 ) * ( 0.10 * exp_gain ) * ( 0.55 + 0.35 * audioLevel );
    vec3 final_col = mix( bg_col, hit_col, hit_mask );
    final_col += glow_tint;

    // No gamma lift: pow(final_col, 0.88) raised the dark neuropil by a fifth,
    // which is the end of the picture that has to stay dark.
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.28 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
