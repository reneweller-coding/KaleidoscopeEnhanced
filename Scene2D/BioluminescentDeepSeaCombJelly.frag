#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file BioluminescentDeepSeaCombJelly.frag
 * @brief BIOLUMINESCENT DEEP SEA COMB JELLY: Macro-scale 3D visualization of a
 * transparent deep-sea comb jelly (Ctenophore) with cascading rainbow diffraction
 * ctene rows, pulsating gelatinous body walls, and luminous internal bio-lanterns.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous ctene row diffraction wave progression
 *   audioKick    -> flashes internal bioluminescent lantern organs & pulse burst
 *   audioCentroid-> sharpens rainbow diffraction grating fringe resolution
 *   audioSubBass -> expands gelatinous jelly bell respiration breathing
 *   audioChromaHue-> steers the deep-sea rainbow diffraction spectrum
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
uniform float cteneRowsP;
uniform float iridescenceP;
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
    float n_ctene = ( cteneRowsP > 1.0 ) ? cteneRowsP : 8.0;
    float irid = ( iridescenceP > 0.01 ) ? iridescenceP : 1.2;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Gelatinous jelly body coordinate
    float r = length( uv );
    float a = atan( uv.y, uv.x );

    // Oval body envelope with audio respiration
    float jelly_r = ( 0.33 + 0.06 * sin( audioSwell * 2.5 ) + 0.04 * audioSubBass ); // 0.65 was LARGER than the frame
                                                                                     // half-height
    vec2  p_oval = uv * vec2( 1.0, 0.75 );
    float d_body = abs( length( p_oval ) - jelly_r );

    // 8 Ctene rows (comb rows) arranged around body perimeter
    float seg = 6.2831853 / n_ctene;
    float a_row = mod( a + seg * 0.5, seg ) - seg * 0.5;

    // Running rainbow diffraction grating waves traveling along ctene rows
    float ctene_phase = a * 3.0 * irid - t * 4.0;
    vec3  rainbow_diffraction = vec3(
                                    sin( ctene_phase ),
                                    sin( ctene_phase + 2.094 ),
                                    sin( ctene_phase + 4.188 ) )
                                    * 0.5
                                + 0.5;

    // Glowing comb row cilia lines
    // Gate the rows onto the body SHELL: without the exp(-d_body...) term
    // they ran as full radial spokes from the centre -- the recording showed
    // a starburst, not an animal.
    // Arcs on the rim, not rays through the body: the angular mask picks
    // the row, the tight shell mask pins it to the surface, and the cilia
    // beat scrolls along each arc.
    float row_mask = exp( -pow( a_row / ( seg * 0.18 ), 2.0 ) );
    float shell_mask = exp( -pow( d_body * 14.0, 2.0 ) );
    float cilia_beat = 0.55 + 0.45 * sin( a * 60.0 - t * 5.0 );
    float row_glow = row_mask * shell_mask * cilia_beat * 1.7;

    // Internal bioluminescent organs (lantern nodes in center)
    float internal_lantern = exp( -r * 8.0 ) * ( 0.16 + 0.35 * audioKick );

    // Sample distorted background photo through transparent gelatinous body
    vec2 sample_uv = fract( uv * 0.5 + vec2( sin( a * 4.0 ), cos( a * 4.0 ) ) * 0.03 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Translucent jelly color
    vec3 pal_base = imgPalette( r * 0.5 + 0.1 );
    vec3 jelly_base = mix( tex_col, pal_base, 0.4 ) * 0.35;

    // Add rainbow ctene rows and internal bio-lantern
    vec3 ctene_color = rainbow_diffraction * row_glow * 1.6 * ( 1.0 + 1.8 * audioKick ) * glw;
    vec3 lantern_color = vec3( 1.3, 1.6, 1.9 ) * internal_lantern;

    // Translucent membrane so the BODY reads, not just its rows.
    float membrane = exp( -d_body * 10.0 );
    vec3  membrane_col = imgPalette( 0.62 ) * membrane * 2.0;
    vec3  final_col = jelly_base + ctene_color + lantern_color + membrane_col;

    // Abyss water vignette
    float vig = 1.0 - smoothstep( 0.85, 1.4, r );
    final_col *= vig;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
