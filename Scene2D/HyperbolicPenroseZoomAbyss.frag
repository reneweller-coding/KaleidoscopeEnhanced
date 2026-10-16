#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file HyperbolicPenroseZoomAbyss.frag
 * @brief HYPERBOLIC PENROSE ZOOM ABYSS: Infinite logarithmic scale dive into a 5-fold
 * Penrose kite-and-dart aperiodic tiling. Continuous golden ratio deflation subdivisions,
 * self-similar multi-octave zoom blending, and glowing gold-metallic tile borders.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous infinite zoom progression into Penrose tiles
 *   audioKick    -> flashes Penrose vertex nodes & triggers deflation scale bursts
 *   audioCentroid-> sharpens golden kite-and-dart tile edge lines
 *   audioSubBass -> expands Penrose star cluster breathing scale
 *   audioChromaHue-> rotates the golden aperiodic crystal spectrum
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
uniform float scaleP; ///< Scale knob.
uniform float edgeWidthP;
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

/**  5-Fold Penrose pentagram grid potential
 *
 * @param p  The point. (in)
 * @param t  Phase of the grid's turn. (in)
 *
 * @return
 *   The potential.
 **/
float penrosePotential( vec2 p, float t )
{
    float sum = 0.0;
    for ( int i = 0; i < 5; ++i )
    {
        float angle = float( i ) * ( 6.2831853 / 5.0 ) + t * 0.1;
        vec2  dir = vec2( cos( angle ), sin( angle ) );
        sum += cos( dot( p, dir ) * 4.0 );
    }
    return sum / 5.0;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float sc_mod = ( scaleP > 0.01 ) ? scaleP : 1.0;
    float e_width = ( edgeWidthP > 0.01 ) ? edgeWidthP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.35 * spd + audioAdvance * 0.28 * spd; // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Golden ratio scaling for seamless deflation zoom
    const float Phi = 1.6180339887;
    float       zoom_prog = mod( t * 0.7, 1.0 );

    vec3  col_acc = vec3( 0.0 );
    float weight_acc = 0.0;

    // Accumulate across 4 nested Penrose scale octaves
    for ( int k = 0; k < 4; ++k )
    {
        float kf = float( k );
        // Sub-bass dilates every octave's star cluster: a smaller layer scale fits
        // fewer kites across the frame, so the pentagonal clusters swell. zoom_prog
        // itself is untouched, keeping the golden-ratio octave crossfade seamless.
        float layer_scale = pow( Phi, kf - zoom_prog + 2.0 ) * ( 2.0 * sc_mod ) / ( 1.0 + 0.3 * audioSubBass );
        float layer_fade = smoothstep( 0.0, 0.3, kf - zoom_prog ) * smoothstep( 3.8, 2.5, kf - zoom_prog );

        if ( layer_fade <= 0.001 )
            continue;

        // 5-Fold rotated coordinate per octave
        float rot_a = t * 0.1 * ( k % 2 == 0 ? 1.0 : -1.0 ) + kf * 0.628;
        float cs = cos( rot_a ), sn = sin( rot_a );
        vec2  p_pen = mat2( cs, -sn, sn, cs ) * uv * layer_scale;

        float pot = penrosePotential( p_pen, t );
        float d_edge = abs( fract( pot * 2.5 ) - 0.5 ) - 0.05 * e_width;
        float edge_glow = exp( -abs( d_edge ) * ( 22.0 + 10.0 * audioCentroid ) ) * glw;

        // Sample distorted background photo
        vec2 sample_uv = fract( p_pen * 0.15 + 0.5 );
        vec3 tex_col = img( sample_uv );
        vec3 pal_col = imgPalette( kf * 0.25 + pot * 0.3 );

        vec3 tile_col = mix( tex_col, pal_col, 0.5 );
        tile_col += vec3( 1.5, 1.3, 0.5 ) * edge_glow * ( 1.0 + 2.5 * audioKick );

        col_acc += tile_col * layer_fade;
        weight_acc += layer_fade;
    }

    vec3 final_col = col_acc / max( 0.001, weight_acc );

    // Center deflation burst
    float center_pulse = pow( max( 0.0, 1.0 - abs( zoom_prog - 0.5 ) * 4.0 ), 3.0 ) * ( 0.6 + 1.5 * audioKick );
    final_col += imgPalette( 0.85 ) * center_pulse;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
