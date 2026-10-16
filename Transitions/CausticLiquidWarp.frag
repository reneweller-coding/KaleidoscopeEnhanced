#version 330 core
/*****************************************************************************\
 *                              CausticLiquidWarp.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  TRANSITION CAUSTIC LIQUID WARP: Underwater optical caustic refraction transition.
 *
 *  Overlapping fluid wave harmonics generate shimmering light caustics and refraction warps that dissolve the
 *  outgoing scene into the incoming one.
 *
 *    interpolation -> controls water surface submergence & clearing progress
 *    audioKick     -> flashes sharp caustic refraction focus lines
 *    audioSwell    -> undulates water wave height & refraction amplitude
 *
 *  Per-activation variety:
 *    causticP float caustic sharpness & intensity (0.5..2.2)
 *    rippleP  float water ripple wave frequency   (0.5..2.0)
 *    speedP   float fluid wave velocity           (0.5..2.0)
 *    hueP     float aquatic caustic hue offset    (0..6.28)
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

uniform float causticP; ///< Caustic knob: caustic sharpness & intensity (0.5..2.2).
uniform float rippleP;  ///< Ripple knob: water ripple wave frequency, 0.5..2.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float cst = ( causticP > 0.0 ) ? causticP : 1.0;
    float rpl = ( rippleP > 0.0 ) ? rippleP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.0492 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // 3 harmonic wave trains for optical caustics
    vec2 p1 = p * 15.0 * rpl;
    vec2 p2 = p * 22.0 * rpl + vec2( t * 1.5, -t * 1.2 );
    vec2 p3 = p * 30.0 * rpl + vec2( -t * 1.1, t * 1.8 );

    float w1 = sin( p1.x + sin( p1.y + t * 2.0 ) );
    float w2 = sin( p2.y + sin( p2.x - t * 2.5 ) );
    float w3 = sin( p3.x + p3.y + t * 3.0 );

    float caustic_field = ( w1 + w2 + w3 ) / 3.0;
    float caustics = pow( max( 0.0, 1.0 - abs( caustic_field ) ), 8.0 ) * cst;

    // Refraction offset vector
    vec2 refr = vec2( w1 - w2, w2 - w3 ) * 0.03 * mid_transition * ( 1.0 + audioSwell * 0.7 );

    vec4 c1 = texture( tex1, fract( uv + refr ) );
    vec4 c0 = texture( tex0, fract( uv - refr ) );

    vec4 col = mix( c1, c0, t_prog );

    // Shimmering aquatic caustic highlights
    vec3 caustic_cyan = vec3( 0.2, 0.9, 1.0 );
    col.rgb += caustics * caustic_cyan * mid_transition * ( 1.2 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
