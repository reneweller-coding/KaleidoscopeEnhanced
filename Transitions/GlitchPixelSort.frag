#version 330 core
/*****************************************************************************\
 *                              GlitchPixelSort.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION GLITCH PIXEL SORT: Directional luminance pixel-sorting transition.
 *
 *  Pixels stretch and sort into horizontal crystalline streaks based on luminance thresholds, glitching and
 *  resolving seamlessly into the incoming scene.
 *
 *    interpolation -> sweeps pixel-sort threshold & glitch severity
 *    audioSwell    -> intensifies the glitch slices (slow)
 *
 *  Per-activation variety:
 *    glitchP float glitch slice frequency & chaos (0.5..2.2)
 *    streakP float pixel sort streak length        (0.5..2.0)
 *    speedP  float animation speed multiplier     (0.5..2.0)
 *    hueP    float glitch chromatic hue offset     (0..6.28)
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
uniform float audioSwell;     ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float glitchP; ///< Glitch knob: glitch slice frequency & chaos (0.5..2.2).
uniform float streakP; ///< Streak knob: pixel sort streak length, 0.5..2.
uniform float speedP;  ///< Speed knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    p = fract( p * vec2( 634.34, 935.21 ) );
    p += dot( p, p + 72.32 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float glt = ( glitchP > 0.0 ) ? glitchP : 1.0;
    float str = ( streakP > 0.0 ) ? streakP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float t = time * 0.04 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                 // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Horizontal glitch block slices
    float slice_y = floor( uv.y * 25.0 * glt );
    float slice_noise = hash21( vec2( slice_y, floor( t * 8.0 ) ) );
    // The slow swell intensifies the glitch: more slices trip the threshold
    // and the ones that do displace harder.  Both are gated by mid_transition,
    // which is zero at the fade endpoints — there the threshold is exactly 0.65
    // again and every consumer of is_glitch_slice is itself multiplied by
    // mid_transition, so the frame is untouched.
    float is_glitch_slice = step( 0.65 - audioSwell * 0.18 * mid_transition, slice_noise );

    // Pixel sorting streak displacement based on luminance
    vec4  base_sample = mix( texture( tex1, uv ), texture( tex0, uv ), t_prog );
    float lum = dot( base_sample.rgb, vec3( 0.299, 0.587, 0.114 ) );

    float streak_offset = ( lum - 0.5 ) * 0.15 * str * mid_transition; // no kick: the sort offset is geometry
    streak_offset += is_glitch_slice * ( slice_noise - 0.5 ) * 0.08 * mid_transition * ( 1.0 + audioSwell * 0.9 );

    vec2 warp_uv = uv + vec2( streak_offset, 0.0 );

    // Chromatic aberration on glitch edges -- widened by the swell, still
    // riding on mid_transition so the split closes to zero at both endpoints.
    float aberr = 0.015 * mid_transition * ( 1.0 + audioSwell * 0.6 );
    vec2  r_uv = warp_uv - vec2( aberr, 0.0 );
    vec2  b_uv = warp_uv + vec2( aberr, 0.0 );

    float r1 = texture( tex1, fract( r_uv ) ).r;
    float g1 = texture( tex1, fract( warp_uv ) ).g;
    float b1 = texture( tex1, fract( b_uv ) ).b;
    vec3  c1 = vec3( r1, g1, b1 );

    float r0 = texture( tex0, fract( r_uv ) ).r;
    float g0 = texture( tex0, fract( warp_uv ) ).g;
    float b0 = texture( tex0, fract( b_uv ) ).b;
    vec3  c0 = vec3( r0, g0, b0 );

    vec3 col = mix( c1, c0, t_prog );

    // Glitch highlight sparks
    float spark = is_glitch_slice * pow( hash21( gl_FragCoord.xy + floor( t * 8.0 ) ), 8.0 )
                  * mid_transition; // held with the slice set: hashing the continuous clock was white noise every frame
    col += spark * vec3( 0.2, 0.9, 1.0 ) * 2.0;

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col = hueRot( col, hue * mid_transition );

    fragColor = vec4( col, 1.0 );
}
