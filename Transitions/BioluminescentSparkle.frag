#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file BioluminescentSparkle.frag
 * @brief TRANSITION BIOLUMINESCENT SPARKLE: Marine dinoflagellate bioluminescence transition.
 * Thousands of sparkling blue-green bioluminescent cellular flashes ignite
 * across fluid wave currents, illuminating and transitioning between scenes.
 *   interpolation -> sweeps bioluminescent sparkling wave front
 *   audioKick     -> triggers full-screen dinoflagellate flash cascade
 *   audioHigh     -> ignites sharp point sparkle glints
 *
 * Per-activation variety:
 *   sparkleP float sparkle flash duration & brightness (0.5..2.2)
 *   densityP float sparkling cellular point density     (0.5..2.0)
 *   speedP   float animation speed multiplier           (0.5..2.0)
 *   hueP     float bioluminescent cyan hue offset       (0..6.28)
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

uniform float sparkleP;
uniform float densityP; ///< Density knob, 0..1.
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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 434.34, 735.21 ) );
    p += dot( p, p + 52.32 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float spk = ( sparkleP > 0.0 ) ? sparkleP : 1.0;
    float den = ( densityP > 0.0 ) ? densityP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.0573 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Cellular grid of sparkling dinoflagellates
    vec2  cell = floor( p * 35.0 * den );
    float cell_rand = hash21( cell );

    // Sparkle pulse timing
    float sparkle_phase = sin( cell_rand * 6.28 + t * 6.0 );
    float sparkle_flash = pow( max( 0.0, sparkle_phase ), 16.0 ) * mid_transition * spk;

    // Fluid wave displacement
    vec2 wave_disp = vec2( sin( p.y * 10.0 + t * 2.0 ), cos( p.x * 10.0 - t * 2.0 ) ) * 0.025 * mid_transition;

    vec4 c1 = texture( tex1, fract( uv + wave_disp ) );
    vec4 c0 = texture( tex0, fract( uv - wave_disp ) );

    // Staggered cellular blend
    float blend = clamp( ( t_prog - cell_rand * 0.3 ) / 0.7, 0.0, 1.0 );
    vec4  col = mix( c1, c0, blend );

    // Bioluminescent cyan-emerald glow
    vec3 bio_cyan = vec3( 0.1, 0.95, 0.9 );
    col.rgb += sparkle_flash * bio_cyan * ( 1.5 + audioKick * 1.17 + audioHigh * 1.5 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
