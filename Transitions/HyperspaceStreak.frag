#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file HyperspaceStreak.frag
 * @brief TRANSITION HYPERSPACE STREAK: Relativistic warp speed streak transition.
 * As the warp drive engages, the outgoing scene stretches into radial light
 * streaks with intense Lorentz contraction, arriving cleanly into the incoming scene.
 *   interpolation -> sweeps sub-light to warp factor 9.9 and decelerates
 *   audioKick     -> flashes warp drive entry/exit relativistic burst
 *   audioSwell    -> sharpens the streak lines (slow)
 *
 * Per-activation variety:
 *   warpP   float warp speed stretch magnitude   (0.5..2.2)
 *   streakP float radial star streak ray density (0.5..2.0)
 *   speedP  float animation speed multiplier     (0.5..2.0)
 *   hueP    float Cherenkov warp hue offset      (0..6.28)
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

uniform float warpP;
uniform float streakP;
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float wrp = ( warpP > 0.0 ) ? warpP : 1.0;
    float str = ( streakP > 0.0 ) ? streakP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.3869 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    float r = length( p );
    float angle = atan( p.y, p.x );

    // Multi-tap radial warp stretch
    float stretch_factor = mid_transition * 0.35 * wrp * ( 1.0 + audioSwell * 0.7 );

    vec3 c1_acc = vec3( 0.0 );
    vec3 c0_acc = vec3( 0.0 );

    for ( int i = 0; i < 8; ++i )
    {
        float fi = float( i ) / 8.0;
        vec2  sample_p = p * ( 1.0 - fi * stretch_factor );
        vec2  sample_uv = ( sample_p * resolution.y + 0.5 * resolution ) / resolution;

        c1_acc += texture( tex1, fract( sample_uv ) ).rgb;
        c0_acc += texture( tex0, fract( sample_uv ) ).rgb;
    }

    vec3 c1 = c1_acc / 8.0;
    vec3 c0 = c0_acc / 8.0;

    vec3 col = mix( c1, c0, t_prog );

    // Radial hyperspace star streaks -- calibrated so the scene stays
    // readable underneath (the old 1.5+kick*3.5 gain whited it out) and
    // anchored to the scene's own brightness so streaks read as ITS light
    // being stretched, not a foreign overlay.
    // audioHigh sharpens the streak lines by raising the ray exponent: a pure
    // profile change (thinner, crisper rays), never a brightness boost, and the
    // t phase inside the sine is left alone.  mid_transition returns the
    // exponent to exactly 12.0 at both fade endpoints.
    float streak_sharp = 12.0 * ( 1.0 + audioSwell * 0.9 * mid_transition );
    float ray_streak = pow( max( 0.0, sin( angle * 40.0 * str + t * 4.0 ) ), streak_sharp ) * mid_transition;
    vec3  streak_cyan = vec3( 0.3, 0.9, 1.0 );
    float scene_lum = dot( col, vec3( 0.333 ) );
    col += ray_streak * streak_cyan * ( 0.2 + 0.5 * scene_lum ) * ( 0.6 + audioKick * 0.6 );

    // Center arrival flash on kick
    float center_flash = exp( -r * 8.0 ) * mid_transition * ( 0.25 + audioKick * 0.35 );
    col += center_flash * vec3( 1.0, 0.98, 0.9 );

    if ( audioChromaHue != 0.0 )
        col = hueRot( col, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col = hueRot( col, hue * mid_transition );

    fragColor = vec4( col, 1.0 );
}
