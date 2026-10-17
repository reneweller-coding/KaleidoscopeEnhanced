#version 330 core
/*****************************************************************************\
 *                              PoincareSpin.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION POINCARE SPIN: Conformal hyperbolic Poincaré disk inversion and continuous Möbius transformation.
 *
 *  The outgoing scene turns inside out through hyperbolic circle inversions while the incoming scene expands
 *  smoothly from the non-Euclidean horizon.
 *
 *    interpolation -> sweeps hyperbolic Möbius translation from 0 to 1
 *    audioKick     -> flashes hyperbolic geodesic boundaries
 *
 *  Per-activation variety:
 *    diskP  float Poincaré disk metric curvature (0.5..2.2)
 *    spinP  float hyperbolic rotation velocity   (0.5..2.0)
 *    speedP float animation speed multiplier      (0.5..2.0)
 *    hueP   float geodesic rim hue offset        (0..6.28)
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

uniform float diskP;  ///< Disk knob: Poincaré disk metric curvature (0.5..2.2).
uniform float spinP;  ///< Spin knob, 0..1.
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
    float c = cos( a ), sn = sin( a );
    return mat2( c, -sn, sn, c );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dsk = ( diskP > 0.0 ) ? diskP : 1.0;
    float spn = ( spinP > 0.0 ) ? spinP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float t = time * 0.0231 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // audioBass pulses the Poincare metric radius (the disk scale).  Gated by
    // mid_transition, so at both fade endpoints the disk is the un-driven one --
    // and uv_warped is blended in by mid_transition there anyway, collapsing to
    // plain uv.
    float disk_radius = 1.8 * dsk; // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    vec2  z = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y * disk_radius;

    // Hyperbolic rotation & translation: z' = (z - a) / (1 - conj(a)*z)
    float rot_angle = ( t_prog * 3.14159265 + t * 0.5 ) * spn;
    z = rot2D( rot_angle ) * z;

    // Möbius parameter a moving across the disk
    vec2 a = vec2( sin( t_prog * 3.14159265 ) * 0.65, 0.0 );

    // Complex division: (z - a) / (1 - a*z)
    vec2  num = z - a;
    vec2  den = vec2( 1.0 - ( a.x * z.x + a.y * z.y ), -( a.x * z.y - a.y * z.x ) );
    float den_mag2 = dot( den, den );
    vec2  z_prime = vec2( dot( num, den ), num.y * den.x - num.x * den.y ) / max( den_mag2, 1e-4 );

    // Conformal sampling UVs
    vec2 uv_warped = z_prime * 0.5 + 0.5;

    vec4 c1 = texture( tex1, fract( mix( uv, uv_warped, mid_transition ) ) );
    vec4 c0 = texture( tex0, fract( mix( uv_warped, uv, 1.0 - mid_transition ) ) );

    vec4 col = mix( c1, c0, t_prog );

    // Glowing geodesic circle rim
    float r = length( z_prime );
    float rim = exp( -abs( r - 1.0 ) * 15.0 ) * mid_transition;
    col.rgb += rim * vec3( 0.1, 0.9, 1.0 ) * ( 1.5 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
