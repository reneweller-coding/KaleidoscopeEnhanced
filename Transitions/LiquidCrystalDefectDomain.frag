#version 330 core
/*****************************************************************************\
 *                              LiquidCrystalDefectDomain.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION LIQUID CRYSTAL DEFECT DOMAIN: Nematic liquid crystal Schlieren transition.
 *
 *  Topological point defects (disclinations with strength s = +/-1/2), rainbow birefringence interference tints on
 *  the domains between them, and dark extinction brushes rotate and annihilate as the director field aligns,
 *  seamlessly transitioning into the incoming scene.
 *
 *    interpolation -> sweeps director field alignment & defect annihilation
 *    audioKick     -> flashes topological disclination core singularities
 *    audioSwell    -> drives director field Frank elastic distortion
 *
 *  Per-activation variety:
 *    defectP float topological defect density & core scale (0.5..2.2)
 *    brushP  float cross-polarizer Schlieren brush width   (0.5..2.0)
 *    speedP  float animation speed multiplier              (0.5..2.0)
 *    hueP    float nematic birefringence hue offset        (0..6.28)
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

uniform float defectP; ///< Defect knob: topological defect density & core scale (0.5..2.2).
uniform float brushP;  ///< Brush knob: cross-polarizer Schlieren brush width, 0.5..2.
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
    float dfc = ( defectP > 0.0 ) ? defectP : 1.0;
    float brs = ( brushP > 0.0 ) ? brushP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.45 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Topological defect points (+1/2 defect at d1, -1/2 defect at d2)
    float defect_dist = mix( 0.3, 0.02, t_prog ) * dfc; // Defects annihilate as t_prog -> 1
    vec2  d1 = vec2( -defect_dist, 0.0 );
    vec2  d2 = vec2( defect_dist, 0.0 );

    float theta1 = atan( p.y - d1.y, p.x - d1.x );
    float theta2 = atan( p.y - d2.y, p.x - d2.x );

    // Director angle: phi = 0.5 * theta1 - 0.5 * theta2
    float director_angle = 0.5 * theta1 - 0.5 * theta2 + t_prog * 3.14159265;

    // Cross-polarizer extinction brushes: I ~ sin^2(2*phi).
    // Square BEFORE pow: pow() with a negative base is undefined in GLSL
    // and produced NaNs that rendered half the frame solid black.
    float s2phi = sin( 2.0 * director_angle );
    float schlieren_brush = pow( s2phi * s2phi, brs );

    // Director field coordinate distortion
    vec2 director_disp = vec2( cos( director_angle ), sin( director_angle ) ) * 0.03 * mid_transition
                         * ( 1.0 + audioSwell * 0.7 );

    vec4 c1 = texture( tex1, fract( uv + director_disp ) );
    vec4 c0 = texture( tex0, fract( uv - director_disp ) );

    vec4 col = mix( c1, c0, t_prog );

    // Birefringence interference colours: between crossed polarizers each
    // director orientation retards the light differently, so the domains
    // around the defects take on rotating rainbow interference tints --
    // THE signature look of a nematic Schlieren texture.
    vec3 biref = 0.5 + 0.5 * cos( 4.0 * director_angle + t_prog * 3.14159265 + vec3( 0.0, 2.094, 4.189 ) );
    col.rgb *= mix( vec3( 1.0 ), biref, 0.45 * mid_transition );

    // Extinction brushes overlay (dark crossed brushes between the domains)
    col.rgb *= mix( 1.0, 0.3 + 0.7 * schlieren_brush, mid_transition );

    // Defect core singularity glow -- small and local; the old 1.5+kick*3
    // gain turned both cores into giant white blobs.
    float core_glow = ( exp( -length( p - d1 ) * 30.0 ) + exp( -length( p - d2 ) * 30.0 ) ) * mid_transition;
    col.rgb += core_glow * vec3( 1.0, 0.85, 0.4 ) * ( 0.25 + audioKick * 0.3 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
