#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file OceanBreakerWave.frag
 * @brief TRANSITION OCEAN BREAKER WAVE: Ocean breaker wave rolling & foam wash transition.
 * A powerful ocean swell rolls across the frame, cresting into a curling breaker
 * wave that crashes with turbulent sea foam and washes into the incoming scene.
 *   interpolation -> sweeps the rolling breaker wave front across the viewport
 *   audioKick     -> flashes churning sea foam spray on wave break
 *   audioSwell    -> drives ocean swell wave amplitude & curl steepness
 *
 * Per-activation variety:
 *   waveP  float ocean swell wavelength & scale (0.5..2.2)
 *   foamP  float crest sea foam spray density   (0.5..2.0)
 *   speedP float wave propagation velocity       (0.5..2.0)
 *   hueP   float ocean water hue offset          (0..6.28)
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

uniform float waveP;  ///< Wave knob.
uniform float foamP;  ///< Foam knob: crest sea foam spray density, 0.5..2.
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
    float wav = ( waveP > 0.0 ) ? waveP : 1.0;
    float fom = ( foamP > 0.0 ) ? foamP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.0817 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Wave rolling from left to right with trochoidal crest steepness
    float wave_front = mix( -1.2, 1.2, t_prog );
    float dist_to_wave = p.x - wave_front + sin( p.y * 8.0 * wav + t * 2.0 ) * 0.08;

    // Trochoidal wave profile
    float wave_height = cos( dist_to_wave * 20.0 );
    float crest_foam = smoothstep( 0.7, 1.0, wave_height ) * exp( -abs( dist_to_wave ) * 12.0 ) * fom;

    // Water refraction displacement
    vec2 water_disp = vec2( sin( dist_to_wave * 15.0 ), cos( p.y * 12.0 + t ) ) * 0.04 * mid_transition
                      * ( 1.0 + audioSwell * 0.7 );

    vec4 c1 = texture( tex1, fract( uv + water_disp ) );
    vec4 c0 = texture( tex0, fract( uv - water_disp ) );

    float wipe_mask = smoothstep( -0.04, 0.04, dist_to_wave );
    vec4  col = mix( c0, c1, wipe_mask );

    // Sea foam whitecaps
    vec3 foam_white = vec3( 0.9, 0.98, 1.0 );
    col.rgb += crest_foam * foam_white * mid_transition * ( 1.5 + audioKick * 1.17 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
