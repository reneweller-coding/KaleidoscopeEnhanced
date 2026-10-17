#version 330 core
/*****************************************************************************\
 *                              LiquidMarbleEbruAcidWash.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  LIQUID MARBLE EBRU ACID WASH: Traditional Turkish Ebru water marbling peacock comb displacement algorithms
 *  supercharged with psychedelic acid wash feedback, melting fluid swirls, and high-energy chromatic edge
 *  degradation.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous comb tine dragging & fluid marbling advection
 *    audioKick    -> flashes liquid acid color inversions & drop splatter shockwaves
 *    audioCentroid-> modulates comb tine spacing & fine filament ripple resolution
 *    audioSubBass -> expands fluid viscosity curl amplitude
 *    audioChromaHue-> rotates the marbled oil-drop rainbow spectrum
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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
uniform float speedP;    ///< Speed knob, 0..1.
uniform float combFreqP; ///< Comb freq knob, 0.7..1.5.
uniform float acidMeltP; ///< Acid melt knob, 0.7..1.5.
uniform float glowP;     ///< Glow / afterglow knob, 0..1.
uniform float hueP;      ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
 * Every base colour here is photo-derived, so a bright photo left the marble ridge filaments and the liquid specular no
 * headroom at all. The probe rides the tex0/tex1 crossfade, so the gain it feeds can never pop, and being one number
 * for the whole frame it rescales exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/**  Ebru peacock comb displacement algorithm: displaces coordinate along sinusoidal tines
 *
 * @param p     The point. (in)
 * @param t     Phase. (in)
 * @param freq  Frequency of the tines. (in)
 * @param dir   Direction and strength of the displacement. (in)
 *
 * @return
 *   The combed point.
 **/
vec2 ebruComb( vec2 p, float t, float freq, float dir )
{
    float tine = sin( p.x * freq + t * 2.0 ) * 0.25;
    p.y += tine * dir;
    return p;
}

/**  A glow of a tint that saturates instead of clipping: as bright as tint * x while that is small, then toward the
 *   tint at full strength (its brightest channel at cap) -- the hue stays.  min( tint * x, vec3( cap ) ) clipped
 *   every channel to cap, and every bright band became one flat white (17.10.2026).
 *
 * @param tint  The glow's colour per unit of x. (in)
 * @param x     The glow's strength, 0.. (in)
 * @param cap   The brightest channel's limit. (in)
 *
 * @return
 *   The glow's colour.
 **/
vec3 glowSat( vec3 tint, float x, float cap )
{
    float m = max( tint.r, max( tint.g, tint.b ) );
    return tint / m * cap * ( 1.0 - exp( -max( x, 0.0 ) * m / cap ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float c_freq = ( combFreqP > 0.01 ) ? combFreqP : 1.0;
    float mlt = ( acidMeltP > 0.01 ) ? acidMeltP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    // Multi-pass Ebru comb displacements in orthogonal directions
    vec2  p_marb = uv;
    float base_freq = ( 8.0 + 4.0 * audioCentroid ) * c_freq;

    p_marb = ebruComb( p_marb, t, base_freq, 1.0 + 0.5 * audioSubBass );
    p_marb.xy = p_marb.yx;
    p_marb = ebruComb( p_marb, -t * 0.8, base_freq * 1.4, -1.0 );
    p_marb.xy = p_marb.yx;

    // Acid melt feedback distortion
    p_marb += vec2( sin( p_marb.y * 6.0 + t ), cos( p_marb.x * 6.0 - t ) ) * ( 0.08 * mlt );

    // Marble droplet rings (concentric drop injections)
    float drop_rings = sin( length( p_marb ) * 18.0 - t * 4.0 );
    float ring_glow = smoothstep( 0.85, 1.0, abs( drop_rings ) ) * glw;

    // Sample distorted background photo
    vec2 sample_uv = fract( p_marb * 0.4 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Acid wash chromatic phase inversion (inverts on audio kick)
    float phase = length( p_marb ) * 0.5 + t * 0.15 + audioKick * 0.5;
    vec3  pal_a = imgPalette( phase );
    vec3  pal_b = imgPalette( phase + 0.5 );
    vec3  marb_col = mix( pal_a, pal_b, 0.5 + 0.5 * drop_rings );

    marb_col = mix( marb_col, tex_col, 0.35 + 0.15 * audioValence );

    // Hold the oil film back to a fixed exposure. The base is entirely
    // mix(imgPalette, photo), so a light photo pinned the whole bath near 1.0
    // and the ridges and sheen were clipped away on top of it.
    float exp_gain = clamp( 0.28 / max( 0.05, photoLevel() ), 0.28, 2.4 );
    marb_col *= exp_gain;

    // Add glowing marble ridge filaments & kick flash. The tint constants
    // exceed 1.0 per channel, so the TINTED vectors carry the caps -- bounding
    // only the scalars left them unbounded.
    vec3 ridge_tint = glowSat( vec3( 1.4, 1.1, 1.7 ), ring_glow * ( 1.0 + 2.5 * audioKick ), 0.85 );
    marb_col += ridge_tint;

    // Specular liquid reflection
    float spec = pow( clamp( 1.0 - abs( drop_rings ) * 2.0, 0.0, 1.0 ), 4.0 );
    marb_col += glowSat( vec3( 1.3, 1.3, 1.5 ), spec * ( 0.5 + 1.0 * audioLevel ), 0.70 );

    marb_col = pow( marb_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( marb_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.28 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
