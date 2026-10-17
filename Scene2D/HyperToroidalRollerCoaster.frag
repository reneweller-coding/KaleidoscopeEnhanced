#version 330 core
/*****************************************************************************\
 *                              HyperToroidalRollerCoaster.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HYPER TOROIDAL ROLLER COASTER: Extreme 3D Frenet-Serret camera tracking ride along a complex (3, 7)-torus knot
 *  roller-coaster track in hyperspace.
 *
 *  Neon laser track rails, high-G bankings and loopings, and chromatic tunnel speed streaks.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous forward roller-coaster velocity along the knot
 *    audioKick    -> flashes track rail support gantries & triggers inversion burst
 *    audioCentroid-> sharpens tubular rail line resolution & track sparks
 *    audioSubBass -> expands torus knot spatial envelope breathing
 *    audioChromaHue-> rotates the luminous hyperspace track spectrum
 *
 *  The (3,7) knot has THREE strands at every azimuth; the old distance estimate
 *  only ever found one of them, so two thirds of the track was invisible and the
 *  ride happened inside an empty frame.  All three lobes are searched now, the
 *  rail carries a volumetric haze and quantised support gantries, and the
 *  hyperspace around it is filled with the chromatic speed streaks this header
 *  always promised.
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
uniform float railWidthP;  ///< Rail width knob, 0.05..0.12.
uniform float knotRadiusP; ///< Knot radius knob, 0.8..1.4.
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

/**  Parametric (3, 7)-torus knot curve point: gamma(u)
 *
 * @param u  Curve parameter (radians). (in)
 * @param R  Major radius. (in)
 * @param r  Minor radius. (in)
 *
 * @return
 *   The point.
 **/
vec3 torusKnotPoint( float u, float R, float r )
{
    float p = 3.0, q = 7.0;
    float r_knot = R + r * cos( q * u );
    return vec3( r_knot * cos( p * u ), r_knot * sin( p * u ), r * sin( q * u ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float r_w = ( railWidthP > 0.01 ) ? railWidthP : 0.08;
    float k_r = ( knotRadiusP > 0.01 ) ? knotRadiusP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.240 * spd + audioAdvance * 0.240 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    // Sub-bass swells the knot's spatial envelope -- major and minor radius
    // together, so the track keeps its (3,7) shape and simply breathes outward.
    // The chase camera is built from the same parametrisation, so it breathes
    // with the rail instead of being left inside/outside the tube.
    float env_b = 1.0 + 0.25 * audioSubBass;
    float R = 2.2 * k_r * env_b;
    float r = 0.85 * k_r * env_b * ( 1.0 + 0.1 * sin( audioSwell * 2.0 ) );

    // Camera track progression parameter u
    float u_cam = t * 0.5;
    vec3  track_pos = torusKnotPoint( u_cam, R, r );
    vec3  ta = torusKnotPoint( u_cam + 0.06, R, r );

    // Frenet frame orientation
    vec3 T = normalize( ta - track_pos );
    vec3 up_approx = normalize( torusKnotPoint( u_cam + 0.03, R, r ) - track_pos );
    vec3 right = normalize( cross( T, vec3( 0.0, 0.0, 1.0 ) + up_approx * 0.5 ) );
    vec3 up = cross( right, T );

    // Chase-cam offset: riding the rail itself puts the camera's own start
    // position ON the track, so the very first raymarch step (p = ro, before
    // any travel) trivially satisfies "distance to track < threshold" for
    // EVERY pixel regardless of ray direction -- an instant, uniform hit
    // that reads as a flat wash instead of a tube flying past. A small
    // sideways offset is enough to break that; a large pull-back along -T
    // overshoots past where tot_dist's max range (10.0) can still reach the
    // rail, which is worse (fully blank instead of just off-centre).
    vec3 ro = track_pos - up * ( r_w * 3.0 + 0.15 );

    // Wider lens: at 1.25 the ride occupied a small central cone of the frame.
    vec3 rd = normalize( uv.x * right + uv.y * up + ( 1.00 + 0.15 * sin( audioSwell * 2.0 ) ) * T );

    // Raymarching through track tube
    float tot_dist = 0.0;
    float min_track_dist = 1e4;
    float rail_haze = 0.0;
    float gantry_acc = 0.0;
    vec3  hit_col = vec3( 0.0 );
    bool  hit = false;

    for ( int i = 0; i < 36; ++i )
    {
        vec3 p = ro + rd * tot_dist;

        // Distance to the closest point on the knot.  gamma(u) has azimuth 3u
        // exactly, so the three curve points sharing this pixel's azimuth are
        // u = (az + 2*pi*k)/3, k = 0,1,2 -- checking only k = 0 threw away two
        // thirds of the (3,7) track.
        float az = atan( p.y, p.x );
        float best_d = 1e4;
        float best_u = 0.0;
        for ( int k = 0; k < 3; ++k )
        {
            float uk = ( az + 6.2831853 * float( k ) ) / 3.0;
            vec3  pk = torusKnotPoint( uk, R, r );
            float dk = length( p - pk );
            if ( dk < best_d )
            {
                best_d = dk;
                best_u = uk;
            }
        }
        float d_track = best_d - r_w;
        min_track_dist = min( min_track_dist, d_track );

        float step_len = max( 0.02, d_track * 0.6 );

        // The chase cam rides within half a unit of its own rail, so the first
        // samples are identical for EVERY pixel: without this ramp they would
        // pump the whole frame up and down together as the camera passed each
        // gantry, which is exactly the sort of frame-wide jump the catalogue
        // scan penalises.
        float near_fade = smoothstep( 0.0, 0.85, tot_dist );

        // Volumetric rail haze: every strand the ray passes near now leaves
        // light in the frame, not just the single nearest one.
        rail_haze += exp( -max( d_track, 0.0 ) * 4.5 ) * step_len * 0.65 * near_fade;

        // Support gantries: rings clamped around the tube, 28 per turn of u.
        float gfrac = abs( fract( best_u * 4.4563 ) - 0.5 );
        gantry_acc += exp( -gfrac * 18.0 ) * exp( -abs( best_d - r_w * 3.0 ) * 8.0 )
                      * step_len * 1.7 * near_fade;

        if ( d_track < 0.005 )
        {
            // Mirrored wrap -- fract() left a seam sliding through the tube.
            vec2 sample_uv = abs( fract( vec2( best_u * 0.25, p.z * 0.15 ) ) * 2.0 - 1.0 );
            vec3 tex_col = img( sample_uv );
            vec3 pal_col = imgPalette( best_u * 0.2 + t * 0.05 );
            hit_col = mix( tex_col, pal_col, 0.5 ) * ( 0.7 + 0.4 * ( 1.0 - d_track ) );
            hit = true;
            break;
        }

        tot_dist += step_len;
        if ( tot_dist > 12.0 )
            break;
    }

    // Glowing laser track rails & support rings
    float rail_glow = exp( -min_track_dist * ( 24.0 + 12.0 * audioCentroid ) ) * glw;
    vec3  rail_tint = min( vec3( 1.4, 1.1, 1.8 ) * rail_glow * ( 1.0 + 1.6 * audioKick ), vec3( 1.1 ) );

    // --- hyperspace: chromatic speed streaks over the whole frame ----------
    float ang = atan( uv.y, uv.x );
    float rad = length( uv );
    float streak = 0.0;
    for ( int s = 0; s < 3; ++s )
    {
        float fs = float( s );
        float k_ang = 17.0 + fs * 26.0;
        float radial = pow( max( 0.0, sin( ang * k_ang + fs * 1.73 ) ), 18.0 - fs * 4.0 );
        // cos() instead of a fract() ramp: the streak heads sweep outward
        // continuously instead of popping when the ramp wraps.
        float head = pow( 0.5 + 0.5 * cos( 6.2831853 * ( rad * 2.2 - t * ( 0.9 + 0.4 * fs ) + fs * 0.37 ) ), 6.0 );
        streak += radial * head * ( 0.50 - fs * 0.12 );
    }
    streak *= smoothstep( 0.04, 0.42, rad ) * ( 0.55 + 0.75 * audioLevel + 0.6 * audioHigh );

    vec3 pal = imgPalette( length( uv ) * 0.4 + 0.2 );
    vec3 bg_col = pal * ( 0.17 + 0.13 * audioLevel );
    // Far hyperspace shell so the corners read as depth, not as nothing.
    bg_col += imgPalette( 0.63 - rad * 0.3 ) * ( 0.09 + 0.06 * audioSwell ) * smoothstep( 0.10, 0.70, rad );
    bg_col += min( streak, 1.0 ) * mix( pal, vec3( 0.75, 0.72, 0.95 ), 0.45 ) * 0.55;

    vec3 final_col = bg_col;
    if ( hit )
        final_col = mix( final_col, hit_col, 0.88 );
    final_col += min( rail_haze, 2.0 ) * mix( pal, vec3( 0.80, 0.70, 1.00 ), 0.5 ) * 0.32;
    final_col += min( gantry_acc, 1.4 ) * vec3( 0.95, 0.84, 1.00 ) * 0.26 * ( 0.55 + 0.9 * audioKick );
    final_col += rail_tint;

    final_col = pow( max( final_col, 0.0 ), vec3( 0.88 ) );
    // Highlight rolloff: more track light in the frame must not clip it white.
    float mx = max( final_col.r, max( final_col.g, final_col.b ) );
    final_col *= 1.0 / ( 1.0 + max( 0.0, mx - 0.80 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
