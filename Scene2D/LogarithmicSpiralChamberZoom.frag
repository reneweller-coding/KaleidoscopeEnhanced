#version 330 core
/*****************************************************************************\
 *                              LogarithmicSpiralChamberZoom.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  LOGARITHMIC SPIRAL CHAMBER ZOOM: Infinite scale plunge into the golden-ratio chambers of a logarithmic spiral
 *  (Nautilus shell).
 *
 *  Iridescent mother-of-pearl (nacre) septum walls, seamless octave zoom transitions, and glowing spiral vortex
 *  currents.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous exponential spiral chamber plunge
 *    audioKick    -> flashes nacre chamber septum walls & explodes vortex core
 *    audioCentroid-> sharpens spiral growth rate b & fine chamber ribbing
 *    audioSubBass -> expands spiral chamber width breathing
 *    audioChromaHue-> steers the iridescent mother-of-pearl (nacre) spectrum
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

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
uniform float speedP;        ///< Speed knob, 0..1.
uniform float spiralGrowthP; ///< Spiral growth knob, 0.2..0.4.
uniform float chambersP;     ///< Chambers knob, 6..10.
uniform float glowP;         ///< Glow / afterglow knob, 0..1.
uniform float hueP;          ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float s_growth = ( spiralGrowthP > 0.01 ) ? spiralGrowthP : 0.306349; // Golden ratio growth: ln(phi)/(pi/2)
    float n_chamb = ( chambersP > 1.0 ) ? chambersP : 8.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    float r = max( 1e-5, length( uv ) );
    // Branch cut rotated to the BOTTOM half-axis (was centre-left); see
    // InfinitePsychedelicDrosteVortex for why it cannot be removed outright.
    float a = atan( -uv.x, uv.y );

    // Log-polar spiral coordinate: theta_spiral = a - ln(r)/b
    float theta_spiral = a - ( log( r ) / s_growth );

    // Chamber phase along the logarithmic spiral. Sub-bass thins the chamber
    // count, i.e. widens each chamber. The t*2.0 plunge is added afterwards at
    // a FIXED rate rather than riding inside theta_spiral: multiplied by an
    // audio-varying chamber factor it would remap the whole accumulated spiral
    // phase in one frame.
    float chamber_w = n_chamb / ( 1.0 + 0.3 * audioSubBass );
    float chamber_index = theta_spiral * ( chamber_w / 6.2831853 ) + t * 2.0 * ( n_chamb / 6.2831853 );
    float chamber_frac = fract( chamber_index );

    // Distance to chamber septum wall
    float d_septum = abs( chamber_frac - 0.5 );
    float septum_glow = smoothstep( 0.42, 0.5, d_septum ) * glw;

    // Mother-of-pearl (nacre) thin-film iridescence
    float nacre_phase = log( r ) * 4.0 + a * 2.0 + t * 0.5;
    vec3  nacre_rainbow = vec3(
                              sin( nacre_phase ),
                              sin( nacre_phase + 2.094 ),
                              sin( nacre_phase + 4.188 ) )
                              * 0.5
                          + 0.5;

    // Sample distorted background photo
    vec2 sample_uv = fract( vec2( chamber_frac, a / 6.2831853 + 0.5 ) );
    vec3 tex_col = img( sample_uv );

    // Golden spiral palette
    vec3 pal_a = imgPalette( floor( chamber_index ) * 0.15 + t * 0.05 );
    vec3 pal_b = imgPalette( floor( chamber_index ) * 0.15 + 0.5 );
    vec3 base_col = mix( pal_a, pal_b, chamber_frac );

    base_col = mix( base_col, tex_col, 0.35 + 0.15 * audioValence );

    // Add glowing septum walls & iridescent nacre highlights
    vec3 septum_tint = vec3( 1.5, 1.3, 1.7 ) * septum_glow * ( 1.0 + 2.5 * audioKick );
    vec3 nacre_tint = nacre_rainbow * 0.35 * ( 0.8 + 0.6 * audioCentroid );

    vec3 final_col = base_col + septum_tint + nacre_tint;

    // Center spiral origin singularity bloom
    float center_bloom = exp( -r * 8.0 ) * ( 1.2 + 2.5 * audioKick );
    final_col += imgPalette( 0.85 ) * center_bloom;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
