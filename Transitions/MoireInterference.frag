#version 330 core
/*****************************************************************************\
 *                              MoireInterference.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION MOIRE INTERFERENCE: Optical Moiré superlattice interference fringes bridging the transition between
 *  scenes.
 *
 *  Overlapping rotating line gratings produce dynamic macroscopic interference waves that carry the cross-fade.
 *
 *    interpolation -> controls grating rotation angle & interference phase
 *    audioKick     -> flashes Moiré constructive interference maxima
 *
 *  Per-activation variety:
 *    freqP  float grating spatial frequency (0.5..2.2)
 *    angleP float relative grating twist     (0.5..2.0)
 *    speedP float animation speed multiplier (0.5..2.0)
 *    hueP   float interference fringe hue    (0..6.28)
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

uniform float freqP;  ///< Freq knob: grating spatial frequency (0.5..2.2).
uniform float angleP; ///< Angle knob: relative grating twist, 0.5..2.
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
    float frq = ( freqP > 0.0 ) ? freqP : 1.0;
    float ang = ( angleP > 0.0 ) ? angleP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.0755 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Grating 1 and Grating 2 with relative twist angle
    float rot1 = t_prog * 0.8 * ang + t * 0.1;
    float rot2 = -t_prog * 0.8 * ang - t * 0.1;

    vec2 p1 = rot2D( rot1 ) * p;
    vec2 p2 = rot2D( rot2 ) * p;

    // audioBass undulates the grating spatial frequency.  It multiplies the
    // SPATIAL term only — the +/- t*2.0 phase is untouched, so the gratings'
    // drift rate stays audio-independent.  mid_transition restores the base
    // frequency at both fade endpoints, where `blend` self-clamps to 0/1 and
    // both the displacement and the fringe glow are multiplied out.
    float grating_freq = 60.0 * frq; // constant: an envelope on a scale re-lays the whole pattern (speed
                                     // pass 14.09.2026)
    float g1 = sin( p1.x * grating_freq + t * 2.0 );
    float g2 = sin( p2.x * grating_freq - t * 2.0 );

    // Moiré superlattice product: cos(k1 - k2)
    float moire_wave = g1 * g2;
    float moire_mask = smoothstep( -0.5, 0.5, moire_wave );

    // Coordinate displacement along Moiré gradient
    vec2 disp = vec2( g1, g2 ) * 0.025 * mid_transition;

    vec4 c1 = texture( tex1, fract( uv + disp ) );
    vec4 c0 = texture( tex0, fract( uv - disp ) );

    // Staggered blend modulated by Moiré fringe
    float blend = clamp( t_prog * 1.5 - ( 1.0 - moire_mask ) * 0.5, 0.0, 1.0 );
    vec4  col = mix( c1, c0, blend );

    // Glowing interference fringe highlights
    float fringe_glow = pow( max( 0.0, moire_wave ), 4.0 ) * mid_transition;
    col.rgb += fringe_glow * vec3( 0.2, 0.9, 1.0 ) * ( 1.2 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
