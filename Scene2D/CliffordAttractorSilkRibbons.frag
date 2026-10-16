#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CliffordAttractorSilkRibbons.frag
 * @brief CLIFFORD ATTRACTOR SILK RIBBONS: Hyper-dense trigonometric Clifford / De Jong
 * attractor density maps with silky flowing ribbon sheets, dynamic parameter morphing,
 * and high-luminance glowing caustics.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Clifford parameter modulation & ribbon flow
 *   audioKick    -> flashes attractor density caustic peaks & shockwave ripple
 *   audioCentroid-> modulates trigonometric frequency parameters (a, b)
 *   audioSubBass -> expands silk ribbon fold amplitude
 *   audioChromaHue-> rotates the flowing iridescent silk spectrum
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
uniform float speedP;   ///< Speed knob, 0..1.
uniform float densityP; ///< Density knob, 0..1.
uniform float silkP;    ///< Silk knob, 0.7..1.4.
uniform float glowP;    ///< Glow / afterglow knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float dens = ( densityP > 0.01 ) ? densityP : 1.0;
    float slk = ( silkP > 0.01 ) ? silkP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.28 * spd + audioAdvance * 0.22 * spd; // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Clifford attractor parameters modulated smoothly across time
    // audioPhase statt Centroid: der Centroid zittert pro Frame und liess die
    // Attraktor-Form zucken statt fliessen.
    float a = -1.4 + 0.4 * sin( t * 0.3 ) + 0.08 * sin( audioPhase * 0.5 );
    float b = 1.6 + 0.3 * cos( t * 0.25 );
    // c/d scale the cosine terms, i.e. how far each Clifford step folds the
    // sheet back on itself; sub-bass swells that fold depth. Bounded well
    // under the |x|,|y| <= 1+c limit so the attractor stays finite.
    float fold_amp = 1.0 + 0.35 * audioSubBass;
    float c = ( 1.0 + 0.3 * sin( t * 0.4 + audioPhase * 0.3 ) ) * fold_amp;
    float d = ( 0.7 + 0.3 * cos( t * 0.35 ) ) * fold_amp;

    // Screen coordinate frame with gentle rotation
    float rot_a = t * 0.15 + audioPhase * 0.1;
    float cs = cos( rot_a ), sn = sin( rot_a );
    vec2  p = mat2( cs, -sn, sn, cs ) * uv * ( 2.8 * dens );

    // Multi-point Clifford attractor evaluation from local coordinate seeds
    float min_dist = 1e5;
    float density_acc = 0.0;

    vec2 p_iter = p;
    for ( int i = 0; i < 28; ++i )
    {
        // Clifford map equation
        float x_next = sin( a * p_iter.y ) + c * cos( a * p_iter.x );
        float y_next = sin( b * p_iter.x ) + d * cos( b * p_iter.y );
        p_iter = vec2( x_next, y_next );

        float d_cur = length( p - p_iter );
        min_dist = min( min_dist, d_cur );
        density_acc += exp( -d_cur * ( 8.0 * slk ) );
    }

    // Sample texture mapped on attractor coordinate
    vec2 sample_uv = fract( p_iter * 0.3 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Luminous silk ribbon caustics
    float silk_glow = exp( -min_dist * ( 12.0 + 8.0 * audioCentroid ) ) * glw;

    // Palette mixing
    vec3 pal_a = imgPalette( density_acc * 0.1 + t * 0.05 );
    vec3 pal_b = imgPalette( density_acc * 0.1 + 0.5 );
    vec3 col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( density_acc * 0.8 + t ) );

    col = mix( col, tex_col, 0.35 + 0.15 * audioValence );

    // Add glowing silk ribbon sheets and kick flashes
    vec3 silk_tint = vec3( 1.3, 1.1, 1.7 ) * ( silk_glow + density_acc * 0.08 ) * ( 1.0 + 2.5 * audioKick );
    col += silk_tint;

    col = pow( col, vec3( 0.88 ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
