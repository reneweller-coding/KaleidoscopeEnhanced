#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file StargateWormhole.frag
 * @brief STARGATE WORMHOLE: Relativistic Einstein-Rosen bridge hyperspace tunnel.
 * Gravitational light lensing around a central singularity, event horizon
 * photon sphere, relativistic Doppler shifts, hyper-velocity star streaks,
 * and explosive accretion corona bursts on audio transients.
 *   audioAdvance -> accelerates warp tunnel velocity & streak velocity
 *   audioSubBass -> expands gravitational lensing ring & singularity radius
 *   audioKick    -> flashes relativistic shockwave accretion flares
 *   audioHigh    -> sparks quantum particle emissions & blue Doppler shift
 *
 * Per-activation variety:
 *   warpP     float hyperspace distortion scale        (0.5..2.2)
 *   lensP     float gravitational lens curvature       (0.5..2.0)
 *   speedP    float travel velocity multiplier         (0.5..1.8)
 *   hueP      float Doppler color spectrum shift       (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;  ///< Sub-bass band level, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioMid;      ///< Mid band level, 0..1.
uniform float audioHigh;     ///< High band level, 0..1.
uniform float audioFlux;     ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float warpP;          ///< Warp knob: hyperspace distortion scale, 0.5..2.2.
uniform float lensP;          ///< Lens knob, 0..1.
uniform float speedP;         ///< Speed knob, 0..1.
uniform float hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

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


/**  House tint: bend a colour toward the photo palette while keeping its luminance -- the identity look survives,
 * only the hue follows the photos.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
}
/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 567.89, 789.01 ) );
    p += dot( p, p + 89.12 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float wrp = ( warpP > 0.0 ) ? warpP : 1.0;
    float lns = ( lensP > 0.0 ) ? lensP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length( uv );
    float a = atan( uv.y, uv.x );

    // Relativistic gravitational light bending around event horizon
    float rs = 0.28 * lns * ( 1.0 + 0.3 * audioSubBass ); // Schwarzschild radius
    float deflection = rs / max( r - rs * 0.5, 0.01 );

    // Warped radius
    float warped_r = r + deflection * 0.15;

    // Hyper-velocity tunnel coordinate
    float cam_z = time * 4.0 * spd + audioAdvance * 8.0;
    float tunnel_z = ( 1.0 / max( warped_r, 0.02 ) ) * wrp + cam_z;

    // Twisted spiral angle
    float spiral_a = a + tunnel_z * 0.08 + sin( tunnel_z * 0.05 ) * 0.5 + audioPhase * 0.3;

    // Relativistic star streaks & hyperspace filament lattice
    vec2 grid = vec2( spiral_a * ( 12.0 / 3.14159 ), tunnel_z * 0.5 );
    vec2 grid_id = floor( grid );
    vec2 grid_f = fract( grid ) - 0.5;

    float streak_seed = hash21( grid_id );
    float streak_mask = step( 0.65, streak_seed );

    // Longitudinal streak stretch
    float streak_dist = length( vec2( grid_f.x, grid_f.y * 0.15 ) );
    float streak_glow = ( 0.006 / ( streak_dist * streak_dist + 0.0008 ) ) * streak_mask;

    // Doppler Shift color spectrum: Blue-shift in center, Red-shift in periphery
    float doppler = clamp( ( 1.0 - r ) * 1.5 + audioAdvance * 0.5, 0.0, 2.0 );
    vec3  doppler_col = palTint( mix( vec3( 1.0, 0.2, 0.1 ), vec3( 0.1, 0.8, 1.0 ), doppler * 0.6 ), 0.30 * doppler,
                                 0.22 );
    doppler_col = mix( doppler_col, vec3( 0.9, 0.4, 1.0 ), sin( tunnel_z * 0.2 ) * 0.5 + 0.5 );

    vec3 col = doppler_col * streak_glow * ( 0.8 + audioHigh * 1.2 );

    // Accretion disk photon sphere ring
    float ring_dist = abs( r - rs * 1.4 );
    float photon_ring = ( 0.004 / ( ring_dist * ring_dist + 0.0003 ) ) * ( 1.0 + audioKick * 2.0 );
    vec3  ring_col = palTint(
        mix( vec3( 1.0, 0.9, 0.4 ), vec3( 0.2, 1.0, 0.8 ), sin( a * 4.0 + time * 3.0 ) * 0.5 + 0.5 ), 0.20, 0.22 );
    col += ring_col * photon_ring;

    // Gravitational lensing photo mapping
    vec2 lens_uv = st + ( uv / max( r, 0.01 ) ) * deflection * 0.08 * ( 1.0 + audioBass );
    vec3 photo = img( clamp( lens_uv, 0.0, 1.0 ) );
    col += photo * ( 0.4 + 0.4 * audioLevel ) * exp( -r * 0.6 );

    // Event horizon singularity darkness
    float horizon_mask = smoothstep( rs * 0.8, rs * 1.05, r );
    col *= horizon_mask;

    // Relativistic warp pulse on heavy kicks
    if ( audioKick > 0.65 )
    {
        float pulse = exp( -abs( r - fract( time * 2.0 ) ) * 6.0 ) * audioKick * 1.5;
        col += vec3( 0.8, 0.95, 1.0 ) * pulse;
    }

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Vignette
    vec2  v_uv = st * ( 1.0 - st.yx );
    float vig = v_uv.x * v_uv.y * 15.0;
    col *= clamp( pow( vig, 0.25 ), 0.0, 1.0 );

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.7;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
