#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file DichroicMirrorSlide.frag
 * @brief TRANSITION DICHROIC MIRROR SLIDE: Dichroic glass beam-splitter transition.
 * Angled optical dichroic mirror planes slide across the screen, transmitting
 * complementary wavelengths and reflecting the outgoing scene into the incoming one.
 *   interpolation -> slides dichroic mirror boundary across the diagonal
 *   audioKick     -> flashes dichroic spectral transmission spikes
 *
 * Per-activation variety:
 *   dichroP float dichroic spectral split intensity (0.5..2.2)
 *   slideP  float slide angle tilt                  (0.5..2.0)
 *   speedP  float animation speed multiplier        (0.5..2.0)
 *   hueP    float dichroic coating hue offset       (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
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

uniform float dichroP; ///< Dichro knob: dichroic spectral split intensity (0.5..2.2).
uniform float slideP;  ///< Slide knob: slide angle tilt, 0.5..2.
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

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dch = ( dichroP > 0.0 ) ? dichroP : 1.0;
    float sld = ( slideP > 0.0 ) ? slideP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Diagonal mirror plane coordinate
    vec2  mirror_dir = normalize( vec2( 1.0, 0.8 * sld ) );
    float proj = dot( p, mirror_dir );

    float slide_pos = mix( -1.2, 1.2, t_prog );
    float dist_to_mirror = proj - slide_pos;

    // Thin-film interference color on glass edge: lambda = 2 n d cos(theta).
    // audioBass undulates the film thickness d, which sets the fringe spacing.
    // mid_transition gates it, so at both fade endpoints the thickness is the
    // un-driven one — and dichroic_reflect only reaches the frame through the
    // mid_transition-gated glass_edge term anyway.
    float film_thickness = 15.0 * dch; // constant: an envelope on a scale re-lays the whole pattern (speed
                                       // pass 14.09.2026)
    vec3 dichroic_reflect = 0.5 + 0.5 * cos( vec3( 0.0, 2.0, 4.0 ) + dist_to_mirror * film_thickness + audioPhase );

    // Glass refraction displacement
    float refr_offset = exp( -abs( dist_to_mirror ) * 10.0 ) * sign( dist_to_mirror ) * 0.03 * mid_transition;
    vec2  warp_uv = uv + mirror_dir * refr_offset;

    vec4 c1 = texture( tex1, fract( warp_uv ) );
    vec4 c0 = texture( tex0, fract( warp_uv ) );

    float wipe_mask = smoothstep( -0.02, 0.02, dist_to_mirror );
    vec4  col = mix( c0, c1, wipe_mask );

    // Glass edge flare
    float glass_edge = exp( -abs( dist_to_mirror ) * 20.0 ) * mid_transition;
    col.rgb += glass_edge * dichroic_reflect * ( 1.5 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
