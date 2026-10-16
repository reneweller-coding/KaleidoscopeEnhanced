#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file FaradayWaveLattice.frag
 * @brief TRANSITION FARADAY WAVE LATTICE: Parametric fluid surface Faraday wave transition.
 * Vertical oscillation of a fluid layer excites subharmonic standing wave lattices
 * (Faraday crispatio), whose undulating nodal grids cross-fade and morph between scenes.
 *   interpolation -> sweeps Faraday standing wave amplitude & lattice modes
 *   audioKick     -> flashes parametric resonance wave crest peaks
 *   audioSwell    -> drives vertical fluid acceleration & wave height
 *
 * Per-activation variety:
 *   faradayP float Faraday wave frequency & wavenumber (0.5..2.2)
 *   gridP    float square vs hexagonal lattice mode    (0.5..2.0)
 *   speedP   float animation speed multiplier          (0.5..2.0)
 *   hueP     float fluid highlight hue offset          (0..6.28)
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

uniform float faradayP; ///< Faraday knob: Faraday wave frequency & wavenumber (0.5..2.2).
uniform float gridP;    ///< Grid knob, 0..1.
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
    float fdy = ( faradayP > 0.0 ) ? faradayP : 1.0;
    float grd = ( gridP > 0.0 ) ? gridP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.1587 * spd; // clock rate measured down to about 1.2/255 of change per frame (PresetEditor
                                   // --transprofile); it spun many times that and read as frantic
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Parametric standing wave field: eta(x,y,t) = cos(kx)*cos(ky)*cos(omega*t)
    vec2  q = p * 20.0 * fdy;
    float mode_x = cos( q.x ) * cos( q.y * grd );
    float mode_diag = cos( 0.707 * ( q.x + q.y ) ) * cos( 0.707 * ( q.x - q.y ) );

    float faraday_wave = mix( mode_x, mode_diag, sin( t * 1.5 ) * 0.5 + 0.5 ) * cos( t * 6.0 );

    // Fluid heightfield normal vector
    vec2 normal_grad = vec2( -sin( q.x ) * cos( q.y ), -cos( q.x ) * sin( q.y ) ) * faraday_wave;
    vec2 disp = normal_grad * 0.03 * mid_transition * ( 1.0 + audioSwell * 0.8 );

    vec4 c1 = texture( tex1, fract( uv + disp ) );
    vec4 c0 = texture( tex0, fract( uv - disp ) );

    float blend = clamp( t_prog + faraday_wave * 0.3 * mid_transition, 0.0, 1.0 );
    vec4  col = mix( c1, c0, blend );

    // Standing wave crest specular glints
    float crest_glint = pow( max( 0.0, faraday_wave ), 4.0 ) * mid_transition;
    col.rgb += crest_glint * vec3( 0.25, 0.9, 1.0 ) * ( 1.3 + audioKick * 1.0 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
