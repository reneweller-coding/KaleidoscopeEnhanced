#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file GoldenNautilus.frag
 * @brief TRANSITION GOLDEN NAUTILUS: Fibonacci golden spiral nautilus chamber sweep.
 * Logarithmic chambers unfurl across the screen in golden ratio proportions
 * (phi = 1.618), sweeping the old scene away and breathing in the new one.
 *   interpolation -> sweeps the golden spiral chamber wipe across the screen
 *   audioKick     -> flashes golden spiral septum chamber walls
 *   audioSwell    -> deepens the spiral warp (slow)
 *
 * Per-activation variety:
 *   phiP   float golden ratio curvature scale (0.5..2.2)
 *   sweepP float chamber sweep sharpness      (0.5..2.0)
 *   speedP float animation speed multiplier   (0.5..2.0)
 *   hueP   float nautilus glow hue offset     (0..6.28)
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

uniform float phiP;   ///< Phi knob: golden ratio curvature scale (0.5..2.2).
uniform float sweepP; ///< Sweep knob: chamber sweep sharpness, 0.5..2.
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
    float phi = ( phiP > 0.0 ) ? phiP : 1.0;
    float swp = ( sweepP > 0.0 ) ? sweepP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    float r = length( p );
    float angle = atan( p.y, p.x );

    // Golden spiral equation: theta = log(r / a) / b
    float b = 0.3063489 * phi; // Golden spiral pitch
    float spiral_theta = ( log( max( r, 0.001 ) / 0.1 ) / b ) - angle;

    // Chamber septa (compartment walls).  audioBass pulses the chamber
    // expansion rate — the septa SPACING, deliberately not the spiral pitch b,
    // which sets spiral_theta and with it the sweep front.  mid_transition gates
    // it back to the plain 2*pi period at both fade endpoints, where the septa
    // glow is zero anyway.
    float chamber_rate = 6.2831853; // constant: an envelope on a scale re-lays the whole pattern (speed
                                    // pass 14.09.2026)
    float chamber = fract( spiral_theta / chamber_rate );
    float wall_dist = min( chamber, 1.0 - chamber );

    // Sweep boundary moving outward along the spiral.  spiral_theta spans
    // roughly [-15, +11] over the visible frame (log(r) blows up toward the
    // centre), so the front must START above the max and END below the min —
    // the old 0..8 sweep left outer regions showing the new scene at t_prog=1
    // and the centre still showing the old one at t_prog=0.
    //
    // Those two bounds are only correct at phi == 1. spiral_theta is
    // log(r/0.1)/b - angle with b proportional to phi, so derive the range
    // instead of hard-coding it: over the visible frame r spans the 0.001 clamp
    // to the corner radius (~1.02), giving a log term in [-4.61, +2.33], and
    // the -angle contributes a further +-pi that does NOT scale with phi.
    // Scaling the whole bound by 1/phi therefore over-corrects at the top of
    // the range (measured 9.4/255 at phiP=2.2), just as the fixed constants
    // under-covered at the bottom (49/255 at phiP=0.5). Computing both ends
    // exactly, with a margin past the smoothstep half-width, holds for every phiP.
    float theta_max = 2.33 / b + 3.1416;
    float theta_min = -4.61 / b - 3.1416;
    float sweep_front = mix( theta_max + 1.0, theta_min - 1.0, 1.0 - t_prog );
    float sweep_mask = smoothstep( sweep_front - 0.5, sweep_front + 0.5, spiral_theta );

    // Subtle coordinate warp
    vec2 warp_uv = uv
                   + vec2( sin( spiral_theta ), cos( spiral_theta ) ) * 0.02 * mid_transition
                         * ( 1.0 + audioSwell * 0.6 );

    vec4 c1 = texture( tex1, fract( warp_uv ) );
    vec4 c0 = texture( tex0, fract( warp_uv ) );

    vec4 col = mix( c0, c1, sweep_mask );

    // Glowing chamber septum walls
    float wall_glow = exp( -wall_dist * 30.0 ) * mid_transition;
    col.rgb += wall_glow * vec3( 1.0, 0.9, 0.4 ) * ( 1.2 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
