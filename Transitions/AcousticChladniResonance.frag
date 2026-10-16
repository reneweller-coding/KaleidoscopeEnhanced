#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file AcousticChladniResonance.frag
 * @brief TRANSITION ACOUSTIC CHLADNI RESONANCE: 2D vibrating plate Chladni resonance transition.
 * Acoustic standing wave eigenmodes vibrate the image plane, collecting sand
 * grains along nodal zero-vibration lines that morph and cross-fade between scenes.
 *   interpolation -> sweeps acoustic resonance frequency & Chladni mode transitions
 *   audioKick     -> flashes acoustic antinodal acceleration peaks
 *   audioSwell    -> drives vibrating plate amplitude & mode numbers (n, m)
 *
 * Per-activation variety:
 *   modeP  float Chladni eigenmode harmonic multiplier (0.5..2.2)
 *   nodalP float nodal line sand line sharpness        (0.5..2.0)
 *   speedP float animation speed multiplier            (0.5..2.0)
 *   hueP   float acoustic glow hue offset              (0..6.28)
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

uniform float modeP;  ///< Mode knob: Chladni eigenmode harmonic multiplier (0.5..2.2).
uniform float nodalP; ///< Nodal knob: nodal line sand line sharpness, 0.5..2.
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
    float mod = ( modeP > 0.0 ) ? modeP : 1.0;
    float ndl = ( nodalP > 0.0 ) ? nodalP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.0552 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Chladni plate eigenmodes (n, m) morphing with transition
    float n = ( 3.0 + t_prog * 3.0 ) * mod;
    float m = ( 5.0 + t_prog * 2.0 ) * mod;

    vec2  q = p * 3.14159265;
    float chladni1 = sin( n * q.x ) * sin( m * q.y ) - sin( m * q.x ) * sin( n * q.y );
    float chladni2 = cos( n * q.x ) * cos( m * q.y ) - cos( m * q.x ) * cos( n * q.y );

    float chladni = mix( chladni1, chladni2, sin( t * 2.0 ) * 0.5 + 0.5 );

    // Nodal line proximity (where vibration = 0)
    float dist_to_node = abs( chladni );
    float nodal_line = exp( -dist_to_node * 15.0 * ndl );

    // Plate vibration displacement
    vec2 vib_disp = vec2( sin( chladni * 5.0 ), cos( chladni * 5.0 ) ) * 0.025 * mid_transition
                    * ( 1.0 + audioSwell * 0.7 );

    vec4 c1 = texture( tex1, fract( uv + vib_disp ) );
    vec4 c0 = texture( tex0, fract( uv - vib_disp ) );

    float blend = clamp( t_prog + chladni * 0.25 * mid_transition, 0.0, 1.0 );
    vec4  col = mix( c1, c0, blend );

    // Glowing resonant nodal lines
    col.rgb += nodal_line * vec3( 1.0, 0.85, 0.35 ) * mid_transition * ( 1.3 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
