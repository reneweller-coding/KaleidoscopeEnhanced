#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file PsychedelicReactionMelt.frag
 * @brief PSYCHEDELIC REACTION MELT: Turing / Gray-Scott procedural reaction-diffusion
 * morphogenetic labyrinth with melting liquid wax feedback, chromatic phase inversions,
 * and high-energy chemical spot/stripe division waves.
 *
 * Audio Reactivity:
 *   audioAdvance -> surges the chemical diffusion advection & melting on top of a
 *                   constant base drift rate (so the reaction never freezes)
 *   audioKick    -> triggers full chromatic phase inversions & chemical shockwave burst
 *   audioCentroid-> modulates Turing labyrinth stripe frequency & spot splitting
 *   audioSubBass -> expands liquid wax melting viscosity
 *   audioChromaHue-> rotates the liquid acid psychedelic palette
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
uniform float meltP;
uniform float spotFreqP;
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

/**  Overall level of the photo currently on the texture units, from a fixed 5-tap grid.
 *
 * @return
 *   The photo's average level, 0..1.
 *
 * Every base colour in this scene is photo-derived, so a bright photo drove the whole reaction field to a uniform white
 * wash - no visible chemistry at all. The probe rides the tex0/tex1 crossfade so the gain it feeds can never pop, and
 * being one number per frame it moves exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/**  Procedural multi-scale Turing reaction-diffusion field
 *
 * @param p     The point. (in)
 * @param t     Time. (in)
 * @param freq  Base frequency. (in)
 *
 * @return
 *   The field value.
 **/
float turingField( vec2 p, float t, float freq )
{
    float f = 0.0;
    float amp = 1.0;
    float cur_freq = freq;

    for ( int i = 0; i < 4; ++i )
    {
        // Rotated sinusoidal standing waves
        float ang = float( i ) * 0.785398 + t * 0.15;
        vec2  dir = vec2( cos( ang ), sin( ang ) );
        vec2  p_warp = p + vec2( sin( p.y * 3.0 + t ), cos( p.x * 3.0 - t ) ) * 0.15;

        float wave = sin( dot( p_warp, dir ) * cur_freq + t * 2.0 );
        f += wave * amp;

        amp *= 0.55;
        cur_freq *= 1.85;
    }
    return f;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float mlt = ( meltP > 0.01 ) ? meltP : 1.2;
    float freq_mod = ( spotFreqP > 0.01 ) ? spotFreqP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    // The reaction only ever advanced on audioAdvance, which creeps at ~0.25/s on
    // quiet material -> the melt stood still. A constant base rate (per-activation
    // constant coefficient on `time`, so anti-flicker safe) keeps it flowing, with
    // audioAdvance still riding on top as the music-driven surge.
    float t = time * 0.30 * spd + audioAdvance * 0.32 * spd;

    // Liquid dripping/melting downward displacement
    vec2 p_melt = uv;
    p_melt.y += sin( p_melt.x * 8.0 + t * 2.0 ) * ( 0.15 * mlt + 0.1 * audioSubBass );
    p_melt += vec2( sin( p_melt.y * 6.0 - t ), cos( p_melt.x * 6.0 + t ) ) * 0.08;

    // Compute Turing morphogenetic field.
    // base_freq was 8..14 and turingField multiplies it by 1.85 per octave (x6.3
    // by the 4th), evaluated on p_melt*2.0 -- the finest octave landed near 170
    // cycles across the frame. That is far past the resolution the picture can
    // hold: every neighbourhood contained the full range of the field, so the
    // whole image averaged to one uniform value with no readable structure.
    // Dropped to a scale where the labyrinth cells are actually SEEN.
    float base_freq = ( 2.6 + 2.0 * audioCentroid ) * freq_mod;
    float chemical_val = turingField( p_melt * 1.1, t, base_freq );

    // Chemical boundary contour lines (isolines). chemical_val spans about +-2.0,
    // so the old *6.0 wrapped the sine ~4x per unit of an already-oscillating
    // field -- pure moire, not contours. *1.2 traces the field's own isolines.
    float iso_lines = abs( sin( chemical_val * 1.2 + t * 3.0 ) );
    float ridge_glow = smoothstep( 0.86, 1.0, iso_lines ) * glw;

    // Large-scale concentration: the slow half of the field, used as a light/dark
    // mask so the frame carries low-frequency contrast instead of one flat level.
    float conc = 0.5 + 0.5 * sin( chemical_val * 0.9 - t * 0.25 );

    // Sample distorted texture along chemical gradient
    vec2 sample_uv = fract( p_melt * 0.5 + vec2( chemical_val * 0.08, 0.0 ) + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Dynamic color phase (inverts on audio kick)
    float phase = chemical_val * 0.4 + t * 0.15 + audioKick * 0.5;
    vec3  pal_a = imgPalette( phase );
    vec3  pal_b = imgPalette( phase + 0.5 );
    vec3  chem_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( chemical_val * 3.0 ) );

    chem_col = mix( chem_col, tex_col, 0.35 + 0.15 * audioValence );

    // Dark troughs / lit crests: without this the base level sat just under the
    // ridge add and the whole frame clamped to white. The photo probe keeps that
    // crest/trough swing readable no matter how bright the current picture is --
    // a near-white photo used to swamp the whole modulation.
    float exp_gain = clamp( 0.42 / max( 0.06, photoLevel() ), 0.55, 1.60 );
    chem_col *= ( 0.30 + 0.85 * conc ) * exp_gain;

    // Add glowing reaction ridge lines and kick flash (bounded - the old
    // unbounded add pushed roughly a third of the frame past 1.0 on its own)
    vec3 neon_ridge = min( vec3( 1.4, 0.9, 1.7 ) * ridge_glow * ( 1.0 + 2.0 * audioKick ),
                           vec3( 0.85, 0.60, 1.00 ) );
    chem_col += neon_ridge * 0.6;

    // Center chemical nucleus bloom
    float center_bloom = exp( -length( uv ) * 4.0 ) * ( 0.35 + 0.7 * audioLevel );
    chem_col += min( imgPalette( 0.8 ) * center_bloom, vec3( 0.42 ) );

    chem_col = pow( min( chem_col, vec3( 1.0 ) ), vec3( 0.87 ) );
    // Soft knee on top of the hard cap: pow(x, 0.87) lifts the midtones, so
    // where a ridge crest lands on an already-lit crest the two still stacked
    // up against the ceiling. The knee bends those crests over instead of
    // flattening them against it.
    vec3 cat_tone = clamp( chem_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.26 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
