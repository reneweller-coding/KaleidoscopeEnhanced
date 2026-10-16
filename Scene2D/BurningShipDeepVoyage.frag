#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file BurningShipDeepVoyage.frag
 * @brief BURNING SHIP DEEP VOYAGE: Continuous deep plunge into the non-analytic
 * Burning Ship fractal z -> (|Re(z)| + i|Im(z)|)^2 + c. Glowing fire kathedrals,
 * burning masts, and high-temperature plasma flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous deep zoom into fractal mast structures
 *   audioKick    -> flashes interior ship core & explodes solar flares
 *   audioCentroid-> sharpens flame filigree & iteration escape boundaries
 *   audioSubBass -> expands ship hull breathing amplitude
 *   audioChromaHue-> steers the fiery aurum/crimson/violet palette
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
uniform float zoomP;  ///< Zoom knob, 0..1.
uniform float flameP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float zm = ( zoomP > 0.01 ) ? zoomP : 1.0;
    float flm = ( flameP > 0.01 ) ? flameP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Voyage course: the dive now has a DESTINATION. At zoom-out the frame
    // holds the whole burning ship hull; as the raised-cosine zoom deepens,
    // the centre glides to the famous "armada" cusp where the little ship
    // replicas line up -- so every cycle reads as travel toward something,
    // not as marble mush (the old centre (-0.45,-0.6) landed in a featureless
    // region and every pixel escaped within 2 iterations).
    vec2  c_overview = vec2( -0.6, -0.55 );
    vec2  c_armada = vec2( -1.7629, -0.0286 );
    float zc = 0.5 - 0.5 * cos( 6.2831853 * fract( t * 0.7 / 6.0 ) ); // 0..1..0
    vec2  c_center = mix( c_overview, c_armada, smoothstep( 0.0, 0.35, zc ) );
    float zoom_level = exp( zc * 7.5 ) * ( 0.55 * zm ) * ( 1.0 + 0.08 * audioSwell );
    // The ship renders upright with the y-window inverted (applied to the
    // WINDOW, so the centre coordinates above are true fractal coordinates).
    vec2 c = c_center + vec2( uv.x, -uv.y ) / zoom_level;

    vec2  z = c;
    float iter_count = -1.0;
    float trap = 1e5;

    // Burning ship iteration loop: z = (|x| + i|y|)^2 + c
    for ( int i = 0; i < 90; ++i )
    {
        vec2 z_abs = abs( z );
        z = vec2( z_abs.x * z_abs.x - z_abs.y * z_abs.y, 2.0 * z_abs.x * z_abs.y ) + c;

        float r2 = dot( z, z );
        trap = min( trap, abs( z.y ) + abs( z.x ) * 0.5 );

        if ( r2 > 16.0 )
        {
            iter_count = float( i ) - log2( max( 1.0, log2( r2 ) ) );
            break;
        }
    }

    vec3 fire_col;
    if ( iter_count < 0.0 )
    {
        // INTERIOR: the hull itself -- near-black iron with a faint ember
        // texture, the iconic silhouette against the fire outside.
        vec3 ember = img( fract( z * 0.15 + 0.5 ) );
        fire_col = vec3( 0.02, 0.015, 0.02 ) + ember * 0.06;
    }
    else
    {
        // EXTERIOR: fire gradient hugging the boundary. High iteration
        // counts (close to the set) burn bright, open water stays dark.
        float g = pow( clamp( iter_count / 42.0, 0.0, 1.0 ), 1.1 );
        vec2  sample_uv = fract( z * 0.2 + 0.5 );
        vec3  tex_col = img( sample_uv );
        vec3  pal_a = imgPalette( g * 0.55 + trap * 0.10 );
        vec3  pal_b = imgPalette( g * 0.55 + 0.5 );
        fire_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( iter_count * 0.6 + t ) );
        fire_col = mix( fire_col, tex_col, 0.25 );
        fire_col *= 0.22 + 2.0 * g;
        // Flame licks on the iteration bands + kick flare
        float flame_glow = exp( -abs( sin( iter_count * 0.4 + t ) ) * ( 15.0 - 5.0 * audioCentroid ) ) * glw;
        fire_col += vec3( 1.6, 1.2, 0.6 ) * flame_glow * g * ( 0.5 + 1.5 * audioKick ) * flm;
    }

    fire_col = pow( fire_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( fire_col, 0.0, 1.0 ), 1.0 );
}
