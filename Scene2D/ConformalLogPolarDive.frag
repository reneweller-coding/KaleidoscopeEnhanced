#version 330 core
/*****************************************************************************\
 *                              ConformalLogPolarDive.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  CONFORMAL LOG POLAR DIVE: Complex exponential mapping w = exp(z) transforming the Cartesian image plane into
 *  infinite swirling twin galactic spiral arms with seamless multi-octave zoom blending and high-energy chromatic
 *  distortion.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous exponential spiral plunge trajectory
 *    audioKick    -> flashes spiral galaxy core & shoots centrifugal ripple waves
 *    audioCentroid-> modulates logarithmic spiral twist angle
 *    audioSubBass -> expands spiral arm width breathing
 *    audioChromaHue-> rotates the conformal galaxy rainbow palette
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
uniform float speedP;  ///< Speed knob, 0..1.
uniform float spiralP; ///< Spiral knob, 0.7..1.5.
uniform float armsP;   ///< Arms knob, 2..4.
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

/**  Overall level of the photo currently on the texture units, from a fixed 5-tap grid.
 *
 * @return
 *   The photo's average level, 0..1.
 *
 * The conformal map paints the photo straight onto the spiral, so a bright photo left the arm filaments and the core
 * bloom no headroom at all. The probe rides the tex0/tex1 crossfade, so the gain it feeds can never pop, and being one
 * number for the whole frame it rescales exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float sprl = ( spiralP > 0.01 ) ? spiralP : 1.0;
    // Rounded to a whole number: a non-integer n_arms tears the angular
    // tiling open at the branch cut (a second source of the same seam).
    float n_arms = floor( ( ( armsP > 1.0 ) ? armsP : 2.0 ) + 0.5 );
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    float r = max( 1e-5, length( uv ) );
    float a = atan( uv.y, uv.x );

    // Conformal log-polar transformation: w = ln(r) + i * theta
    float ln_r = log( r );

    // Spiral winding as an INTEGER per-activation constant. The old
    // continuously-varying winding made the atan branch cut jump by a
    // non-integer amount through the fract() below -- the user-reported
    // discontinuous line down the left half of the frame. An integer number
    // of wraps passes through fract() invisibly.
    float wind = max( 1.0, floor( 1.2 * sprl + 0.5 ) );

    // Log-polar coordinates with continuous forward translation along ln_r and rotation along a
    vec2 log_polar = vec2(
        ln_r * 0.6 - t * 0.8 + a * wind * 0.159155,
        a / 6.2831853 + t * 0.1 );

    // Multi-octave blending
    float phase = fract( log_polar.x );
    vec3  col_acc = vec3( 0.0 );
    float weight_acc = 0.0;

    for ( int k = -1; k <= 1; ++k )
    {
        float f = phase + float( k );
        float w = exp( -4.0 * ( f - 0.5 ) * ( f - 0.5 ) );

        vec2 sample_coord = vec2( f * 2.0, log_polar.y * n_arms );
        vec3 sample_col = img( fract( sample_coord ) );
        vec3 pal_col = imgPalette( f * 0.3 + a / 6.2831853 );

        col_acc += mix( sample_col, pal_col, 0.45 ) * w;
        weight_acc += w;
    }

    // Hold the galactic disc back to a fixed dark base: spiral arms only read
    // against dark inter-arm space, and with a bright photo the octave-blended
    // base alone already sat near 1.0.
    vec3  final_col = col_acc / max( 0.001, weight_acc );
    float exp_gain = clamp( 0.27 / max( 0.05, photoLevel() ), 0.27, 2.4 );
    final_col *= exp_gain;

    // Glowing logarithmic spiral arm filaments
    float arm_dist = abs( sin( ln_r * 4.0 - a * wind * n_arms + t * 4.0 ) );
    // Sub-bass drops the smoothstep edge, widening the band of arm_dist that
    // counts as "inside an arm" -- the arms breathe fatter. The divisor trades
    // peak intensity for that extra area so the widened arms don't clip.
    float arm_edge = 0.85 - 0.22 * audioSubBass;
    float arm_glow = smoothstep( arm_edge, 1.0, arm_dist ) * glw * ( 1.0 + 2.5 * audioKick )
                     / ( 1.0 + 0.35 * audioSubBass );
    // The tint constant exceeds 1.0 on two channels, so the TINTED vector
    // carries the cap -- bounding only arm_glow still let vec3(1.3,1.1,1.8) * it
    // run past white on every kick.
    final_col += min( vec3( 1.3, 1.1, 1.8 ) * arm_glow * 0.7, vec3( 0.85 ) );

    // Center singularity core bloom. imgPalette() is a photo sample, so it
    // rides the same exposure gain as the base and is capped as well -- a
    // kick used to multiply a near-white palette by 3.7 right at the core.
    float center_bloom = exp( -r * 8.0 ) * ( 1.2 + 2.5 * audioKick );
    final_col += min( imgPalette( 0.85 ) * exp_gain * center_bloom, vec3( 0.90 ) );

    final_col = pow( final_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.28 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
