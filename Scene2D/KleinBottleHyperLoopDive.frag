#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file KleinBottleHyperLoopDive.frag
 * @brief KLEIN BOTTLE HYPER LOOP DIVE: 3D Raymarching plunge through a self-intersecting
 * 4D Klein Bottle immersion. Seamless flight from exterior space into interior
 * space without crossing an edge, with inverting normal colors and portal flash pulses.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge along the Klein loop
 *   audioKick    -> flashes self-intersection singularity & topology inversion
 *   audioCentroid-> modulates Klein bottle surface ribbing resolution
 *   audioSubBass -> expands bottle neck diameter breathing
 *   audioChromaHue-> steers the non-orientable surface rainbow palette
 */

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
uniform float speedP;  ///< Speed knob, 0..1.
uniform float radiusP; ///< Radius knob, 0..1.
uniform float twistP;  ///< Twist knob, 0..1.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
 * Every colour in this scene -- surface, background haze, palette -- is photo-derived and the library spans near-black
 * to near-white, which is what dropped this dive to a near-black frame. The probe rides the tex0/tex1 crossfade so the
 * gain can never pop, and one number for the whole frame rescales exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/**  Distance estimator for Figure-8 Klein Bottle immersion in 3D
 *
 * @param p       The point. (in)
 * @param t       The scene's time. (in)
 * @param rBase   Radius of the base loop. (in)
 * @param uCoord  Receives the angle around the loop. (out)
 *
 * @return
 *   The distance to the surface.
 **/
float mapKlein( vec3 p, float t, float rBase, out float uCoord )
{
    float r = length( p.xy );
    float a = atan( p.y, p.x );
    uCoord = a;

    // Figure-8 cross section: r(v) = (rBase + cos(u/2)*sin(v) - sin(u/2)*sin(2v))
    float u_half = a * 0.5 + t * 0.4;
    float v = atan( p.z, r - rBase );

    // Sub-bass swells the base cross-section, i.e. the neck the camera flies
    // through; only the constant term is scaled so the figure-8 lobes keep
    // their shape and cross_sec_r can never approach 0 (min stays ~0.35).
    float cross_sec_r = 0.65 * ( 1.0 + 0.3 * audioSubBass ) + 0.25 * cos( u_half ) * sin( v )
                        - 0.25 * sin( u_half ) * sin( 2.0 * v );
    float d = length( vec2( r - rBase, p.z ) ) - cross_sec_r;

    return d * 0.65;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float r_b = ( radiusP > 0.01 ) ? radiusP : 1.8;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Camera ride coordinate inside the Klein bottle tube
    float a_cam = t * 0.5;
    vec3  ro = vec3( cos( a_cam ) * r_b, sin( a_cam ) * r_b, 0.3 * sin( a_cam * 2.0 ) );
    vec3  ta = vec3( cos( a_cam + 0.1 ) * r_b, sin( a_cam + 0.1 ) * r_b, 0.3 * sin( ( a_cam + 0.1 ) * 2.0 ) );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 0.0, 1.0 ) ) );
    vec3 vv = cross( uu, ww );
    vec3 rd = normalize( uv.x * uu + uv.y * vv + ( 1.25 + 0.2 * sin( audioSwell * 2.0 ) ) * ww );

    // Raymarching through Klein bottle
    float tot_dist = 0.0;
    float hit_u = 0.0;
    vec3  hit_p = ro;
    bool  hit = false;
    vec3  hit_col = vec3( 0.0 );

    for ( int i = 0; i < 64; ++i )
    {
        vec3  p = ro + rd * tot_dist;
        float cur_u;
        float d = mapKlein( p, t, r_b, cur_u );
        float ad = abs( d );

        // The camera rides INSIDE the tube, where the estimator is negative.
        // Sphere-tracing the SIGNED value pinned every step at the old 0.015
        // floor and the 0.003 hit window was narrower than the distance one
        // such step covers, so rays walked straight through the wall: all but
        // a small central disc fell out of the loop with hit_col still black,
        // and the frame collapsed to the dim background ring pattern. March
        // on |d| -- inside the tube that IS the distance to the wall -- with a
        // window wide enough that a step can no longer jump over it.
        if ( ad < 0.008 + tot_dist * 0.004 )
        {
            hit = true;
            hit_u = cur_u;
            hit_p = p;
            vec2 sample_uv = fract( vec2( hit_u / 6.2831853 + 0.5, p.z * 0.4 ) );
            vec3 tex_col = img( sample_uv );
            vec3 pal = imgPalette( hit_u / 6.2831853 + t * 0.05 );
            hit_col = mix( tex_col, pal, 0.5 ) * ( 0.55 + 0.65 * exp( -tot_dist * 0.35 ) );
            break;
        }

        if ( tot_dist > 8.0 )
            break;

        tot_dist += max( 0.004, ad * 0.6 );
    }

    // Glowing surface ribs. The old scalar was exp(-minD * k), but now that
    // the march actually lands on the surface minD is ~0 for every hit pixel,
    // which would turn the rib term into a full-frame constant. Read the
    // ribbing off the hit point's own (u, v) surface coordinates instead --
    // that is what "ribbing resolution" was meant to modulate.
    vec2  rib_vec = vec2( length( hit_p.xy ) - r_b, hit_p.z );
    float rib_v = ( dot( rib_vec, rib_vec ) > 1e-8 ) ? atan( rib_vec.y, rib_vec.x ) : 0.0;
    float ribs = pow( max( 0.0, sin( hit_u * 3.0 + rib_v * ( 5.0 + 4.0 * audioCentroid ) + t ) ), 6.0 );
    float rib_glow = ribs * glw * float( hit ) * ( 0.30 + 0.25 * audioLevel );
    vec3  glow_tint = min( vec3( 1.3, 1.1, 1.8 ) * rib_glow * ( 1.0 + 2.5 * audioKick ), vec3( 1.15 ) );

    // Surface-vs-background selection. The old test was
    // mix(bg, hit_col, clamp(length(hit_col), 0, 1)) -- with a dark photo a
    // genuine hit has length ~0.18, so it silently blended 82% of the even
    // darker background back in and crushed the surface into the floor. Use
    // the march's own hit flag, and let DISTANCE, not brightness, do the fade.
    vec3 bg_col = imgPalette( length( uv ) * 0.4 + 0.3 ) * ( 0.30 + 0.20 * audioLevel );
    vec3 final_col = hit ? hit_col : bg_col;
    final_col = mix( final_col, bg_col, clamp( tot_dist * 0.09, 0.0, 0.5 ) );

    // Everything above is photo-derived, so put the plunge on a fixed
    // exposure rather than inheriting whatever the bound image happens to be.
    final_col *= clamp( 0.28 / max( 0.05, photoLevel() ), 0.35, 3.2 );
    final_col += glow_tint;

    final_col = pow( final_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.25 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
