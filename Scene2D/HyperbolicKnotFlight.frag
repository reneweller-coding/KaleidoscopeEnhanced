#version 330 core
/*****************************************************************************\
 *                              HyperbolicKnotFlight.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HYPERBOLIC KNOT FLIGHT: High-G 3D roller-coaster ride along a parametric (p, q) torus knot curve with
 *  Frenet-Serret camera banking, concentric neon plasma rings, reflective mirror-chamber walls, and dynamic
 *  velocity boosts.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous roller coaster forward progress along the knot
 *    audioKick    -> accelerates flight velocity in loopings & flashes plasma rings
 *    audioCentroid-> modulates knot p/q harmonic frequencies & track twist
 *    audioSubBass -> expands plasma ring diameter breathing
 *    audioChromaHue-> rotates the neon roller coaster spectrum
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
uniform float knotP;       ///< Knot knob, 1..3.
uniform float tubeRadiusP; ///< Tube radius knob, 0.7..1.4.
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

/**  Overall level of the photo currently bound, from a fixed 5-tap grid.
 *
 * @return
 *   The photo's average level, 0..1.
 *
 * The mirror-chamber walls and the palette are entirely photo-derived and the library spans near-black to near-white,
 * which is half of why this flight sat at a tenth of its intended exposure. The probe rides the tex0/tex1 crossfade so
 * the gain can never pop, and one number for the whole frame rescales exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/**  Parametric (p, q) torus knot position: r(s)
 *
 * @param s       Curve parameter (radians). (in)
 * @param pParam  Winding p. (in)
 * @param qParam  Winding q. (in)
 *
 * @return
 *   The point of the knot.
 **/
vec3 knotCurve( float s, float pParam, float qParam )
{
    float r_major = 2.4;
    float r_minor = 0.9;
    float phi = pParam * s;
    float theta = qParam * s;

    float r = r_major + r_minor * cos( theta );
    return vec3( r * cos( phi ), r * sin( phi ), r_minor * sin( theta ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float k_mod = ( knotP > 0.01 ) ? knotP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Torus knot harmonic frequencies (e.g. 2, 3 trefoil or 3, 5 knot)
    float pParam = 2.0;
    float qParam = 3.0 + floor( k_mod * 1.5 );

    // Camera ride coordinate along knot parameter s
    float s_cam = t * 0.5;
    vec3  track_pos = knotCurve( s_cam, pParam, qParam );
    vec3  ta = knotCurve( s_cam + 0.08, pParam, qParam );

    // Frenet-Serret tangent, normal, binormal frame
    vec3 T = normalize( ta - track_pos );
    vec3 up_approx = normalize( knotCurve( s_cam + 0.08, pParam, qParam ) - knotCurve( s_cam - 0.08, pParam, qParam )
                                + vec3( 0, 0, 1 ) );
    vec3 N = normalize( cross( T, up_approx ) );
    vec3 B = cross( N, T );

    // Roll banking in turns
    float roll_angle = sin( s_cam * qParam ) * 0.4 + 0.1 * audioSwell;
    float cs_r = cos( roll_angle ), sn_r = sin( roll_angle );
    vec3  right = N * cs_r - B * sn_r;
    vec3  up = N * sn_r + B * cs_r;

    // Chase-cam offset: riding the rail itself puts the camera's own start
    // position ON the knot curve, so the very first raymarch step (p = ro,
    // before any travel) trivially satisfies "distance to rail < threshold"
    // for EVERY pixel regardless of ray direction -- an instant, uniform hit
    // that reads as a flat wash instead of a tube flying past.
    vec3 ro = track_pos - up * 0.4;

    vec3 rd = normalize( uv.x * right + uv.y * up + ( 1.2 + 0.2 * sin( audioSwell * 2.0 ) ) * T );

    // Raymarch through knot track and surrounding neon chamber
    float tot_dist = 0.0;
    float min_track_dist = 1e4;
    vec3  hit_col = vec3( 0.0 );
    float ring_glow_acc = 0.0;
    bool  hit = false;

    for ( int i = 0; i < 56; ++i )
    {
        vec3 p = ro + rd * tot_dist;

        // Distance to surrounding reflective cubic mirror chamber
        vec3  q_room = abs( p ) - vec3( 3.8 );
        float d_room = -max( max( q_room.x, q_room.y ), q_room.z );

        // Distance to the knot rail tube
        // Sample nearest knot curve point
        float s_approx = s_cam + tot_dist * 0.15;
        vec3  p_knot = knotCurve( s_approx, pParam, qParam );
        float d_rail = length( p - p_knot ) - ( 0.08 + 0.03 * audioLevel );

        // Periodic glowing neon rings along the rail
        float ring_dist = abs( sin( s_approx * 25.0 - t * 4.0 ) );
        // Sub-bass softens the radial falloff instead of adding light: the ring
        // reaches further out from the rail (a visibly fatter plasma hoop) while
        // its on-rail peak, which the tint constants are balanced against, is
        // exactly unchanged.
        ring_glow_acc += exp( -max( 0.0, d_rail ) * 10.0 / ( 1.0 + 0.4 * audioSubBass ) )
                         * smoothstep( 0.8, 1.0, ring_dist ) * ( 0.06 + 0.09 * audioKick );

        float d = min( d_rail, abs( d_room ) );
        min_track_dist = min( min_track_dist, d_rail );

        // d_rail is measured against a curve point that slides FORWARD with the
        // march (s_approx tracks tot_dist), so it is not a conservative distance
        // and for the whole forward cone it sat near-constant around 0.35,
        // pinning the step size. The far-plane arm therefore has to be
        // reachable within the iteration budget, and `i >= 55` guarantees the
        // pixel resolves to chamber colour rather than falling out of the loop
        // unshaded.
        if ( d < 0.005 || tot_dist > 11.0 || i >= 55 )
        {
            hit = true;
            vec2 sample_uv = fract( p.xy * 0.2 + p.z * 0.2 + 0.5 );
            vec3 tex_col = img( sample_uv );
            vec3 pal = imgPalette( s_approx * 0.1 + t * 0.05 );
            // d is ~0 at every hit, so the old (0.7 + 0.4 * (1.0 - d)) term
            // was a constant 1.1 and the chamber had no depth cue at all.
            // Fade with travelled distance instead: near rail-side geometry
            // stays bright, the far end of the chamber falls away.
            hit_col = mix( tex_col, pal, 0.5 ) * ( 0.55 + 0.70 * exp( -tot_dist * 0.22 ) );
            break;
        }

        tot_dist += max( 0.02, d * 0.7 );
    }

    // Glowing rail lines & plasma rings
    float rail_glow = exp( -max( 0.0, min_track_dist ) * ( 24.0 + 12.0 * audioCentroid ) ) * glw;
    // The tint exceeds 1.0 per channel on its own and ring_glow_acc accumulates
    // over the whole march, so the TINTED vector is what has to be capped.
    vec3 rail_tint = min( vec3( 1.3, 1.0, 1.7 ) * ( rail_glow + ring_glow_acc ) * ( 1.0 + 2.5 * audioKick ),
                          vec3( 1.3 ) );

    // Background laser chamber grid. The old selector was
    // mix(bg, hit_col, clamp(length(hit_col), 0, 1)): intended as a "did we
    // hit?" test, it doubles as a brightness crusher -- with a dark photo a
    // genuine wall hit has length ~0.18, so it blended 82% of the (even
    // darker, 0.2-scaled) background back over the top. That, not the march,
    // is what left this flight at a tenth of its intended exposure. Select on
    // the march's own hit flag instead.
    vec3 bg_col = imgPalette( 0.3 ) * ( 0.30 + 0.18 * audioLevel );
    vec3 final_col = hit ? hit_col : bg_col;

    // Everything above is photo-derived: put the chamber on a fixed exposure
    // rather than inheriting whatever image happens to be bound.
    final_col *= clamp( 0.30 / max( 0.05, photoLevel() ), 0.40, 3.0 );
    final_col += rail_tint;

    final_col = pow( final_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.26 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone /= 1.0 + 0.50 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) ); // peak knee: tame local glare, keep
                                                                               // midtones
    fragColor = vec4( cat_tone, 1.0 );
}
