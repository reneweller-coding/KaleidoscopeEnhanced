#version 330 core
/*****************************************************************************\
 *                              PulsarMagnetosphereJets.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PULSAR MAGNETOSPHERE JETS: Rapidly spinning millisecond pulsar with twisted dipole magnetic light cylinder,
 *  polar synchrotron radiation lighthouse beams sweeping directly across viewport, and photo texture warping in
 *  magnetosphere.
 *
 *    audioAdvance -> locks rotation velocity of the millisecond pulsar
 *    audioKick    -> flashes blinding lighthouse synchrotron beam pass
 *    audioSubBass -> expands pulsar magnetosphere Alfvén wave ripples
 *    audioHigh    -> sparks synchrotron gamma-ray flashes
 *
 *  Per-activation variety:
 *    spinP    float pulsar rotation period multiplier       (0.5..2.2)
 *    beamP    float relativistic lighthouse beam intensity  (0.5..2.2)
 *    fieldP   float dipole magnetic field line density      (0.5..1.8)
 *    hueP     float synchrotron radiation hue offset        (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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

uniform float spinP;          ///< Spin knob, 0..1.
uniform float beamP;          ///< Beam knob: relativistic lighthouse beam intensity, 0.5..2.2.
uniform float fieldP;         ///< Field knob: dipole magnetic field line density, 0.5..1.8.
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
    float spn = ( spinP > 0.0 ) ? spinP : 1.0;
    float bm = ( beamP > 0.0 ) ? beamP : 1.0;
    float fld = ( fieldP > 0.0 ) ? fieldP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length( uv );
    float a = atan( uv.y, uv.x );

    // Pulsar rotation angle
    float rot_angle = time * 3.0 * spn + audioAdvance * 0.8;

    // Relativistic polar lighthouse beam (sweeping across screen)
    vec2 beam_dir1 = vec2( cos( rot_angle ), sin( rot_angle ) );
    vec2 beam_dir2 = -beam_dir1;

    float dot1 = max( dot( normalize( uv ), beam_dir1 ), 0.0 );
    float dot2 = max( dot( normalize( uv ), beam_dir2 ), 0.0 );
    float beam_pass = pow( max( dot1, dot2 ), 24.0 ) * bm * ( 1.0 + audioKick * 3.5 );

    vec3 beam_col = imgPalette( 0.25 * beam_pass ) * 1.4 * beam_pass * 3.0;

    // Dipole magnetic field lines (r = R0 * sin^2(theta))
    float mag_theta = a - rot_angle;
    float dipole_field = abs( r - 0.5 * pow( sin( mag_theta * fld ), 2.0 ) );
    float field_glow = ( 0.002 / ( dipole_field * dipole_field + 0.0003 ) ) * ( 0.8 + 0.4 * audioSwell );
    vec3  field_col = vec3( 0.8, 0.2, 1.0 ) * field_glow;

    // Neutron star central core (radius ~ 0.06)
    float core_dist = length( uv );
    float core_glow = ( 0.008 / ( core_dist * core_dist + 0.001 ) ) * ( 1.0 + audioKick * 2.0 );
    vec3  core_col = vec3( 1.0, 1.0, 1.0 ) * core_glow;

    // Warped background photo
    vec2 photo_uv = st + normalize( uv ) * ( 0.04 / ( r + 0.1 ) ) * ( 1.0 + audioSubBass );
    vec3 photo = img( clamp( photo_uv, 0.0, 1.0 ) );

    // Combine pulsar visualizer
    vec3 col = photo * 0.3 + field_col + beam_col + core_col;

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    fragColor = vec4( col, 1.0 );
}
