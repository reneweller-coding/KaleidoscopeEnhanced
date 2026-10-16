#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SolarMagnetoPlasmaLoop.frag
 * @brief SOLAR MAGNETO PLASMA LOOP: Twisted magnetic helical coronal loops emerging
 * from a boiling solar photosphere with coronal reconnection flares, solar prominence
 * arcs, and high-energy coronal mass ejection (CME) shockwaves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous solar magnetic convection & helical loop twist
 *   audioKick    -> triggers violent magnetic reconnection flares & CME plasma bursts
 *   audioCentroid-> sharpens magnetic flux rope filament resolution
 *   audioSubBass -> expands photospheric granulation convection boiling
 *   audioChromaHue-> steers the extreme solar flare hydrogen/helium spectrum
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP; ///< Speed knob, 0..1.
uniform float loopCountP;
uniform float flareIntensityP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float n_loops = ( loopCountP > 1.0 ) ? loopCountP : 3.0;
    float flare_int = ( flareIntensityP > 0.01 ) ? flareIntensityP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Boiling solar surface granulation background
    float gran_noise = sin( uv.x * 20.0 + t * 2.0 ) * cos( uv.y * 20.0 - t * 1.5 );
    float gran = smoothstep( -0.4, 0.8, gran_noise ) * ( 0.6 + 0.4 * audioSubBass );

    vec3  loop_acc = vec3( 0.0 );
    float flare_acc = 0.0;

    // Accumulate across multiple magnetic coronal loops
    int num_l = int( clamp( n_loops, 2.0, 5.0 ) );
    for ( int k = 0; k < 4; k++ )
    {
        if ( k >= num_l )
            break;
        float kf = float( k );

        // Parametric semi-circular coronal loop arc centered at bottom
        float arc_radius = 0.55 + kf * 0.25 + 0.1 * sin( audioSwell * 2.5 + kf );
        vec2  arc_center = vec2( ( kf - 1.5 ) * 0.35 + sin( t * 0.4 + kf ) * 0.15, -0.4 );

        vec2  rel = uv - arc_center;
        float r_arc = length( rel );
        float a_arc = atan( rel.y, rel.x );

        // Distance to the coronal loop tube
        float d_loop = abs( r_arc - arc_radius ) - 0.03;

        // Helical magnetic twisting along the loop arc
        float helix_twist = sin( a_arc * 16.0 + r_arc * 12.0 - t * 5.0 + kf );
        float loop_filament = exp( -abs( d_loop + helix_twist * 0.02 ) * ( 24.0 + 12.0 * audioCentroid ) );

        // Reconnection flare at the apex of the loop (a_arc near pi/2)
        float apex_dist = length( rel - vec2( 0.0, arc_radius ) );
        float flare_node = exp( -apex_dist * 14.0 ) * ( 1.0 + 3.0 * audioKick ) * flare_int;
        flare_acc += flare_node;

        // Color gradient of loop (golden hydrogen alpha to extreme ultraviolet core)
        vec3 loop_col = mix( vec3( 1.8, 1.2, 0.2 ), vec3( 1.9, 0.3, 0.8 ), clamp( rel.y / arc_radius, 0.0, 1.0 ) );
        loop_col = mix( loop_col, imgPalette( kf * 0.25 + 0.1 ), 0.35 );

        loop_acc += ( loop_col * loop_filament + vec3( 1.9, 1.8, 1.4 ) * flare_node ) * glw;
    }

    // Sample distorted background photo
    vec2 sample_uv = fract( uv * 0.4 + vec2( t * 0.05, gran * 0.05 ) + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Photosphere surface base
    vec3 photosphere_col = mix( vec3( 1.6, 0.8, 0.1 ), vec3( 1.2, 0.2, 0.1 ), gran );
    vec3 base_col = mix( photosphere_col, tex_col, 0.35 );

    vec3 final_col = base_col * 0.4 + loop_acc;

    // Global coronal halo flare
    float coronal_glow = exp( -length( uv + vec2( 0.0, 0.4 ) ) * 3.0 ) * ( 0.8 + 1.5 * audioKick );
    final_col += imgPalette( 0.85 ) * coronal_glow;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
