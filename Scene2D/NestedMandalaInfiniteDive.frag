#version 330 core
/*****************************************************************************\
 *                              NestedMandalaInfiniteDive.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  NESTED MANDALA INFINITE DIVE: Multi-plane continuous forward plunge through stacked ornate mandala gates with
 *  center puncture shockwaves, depth-of-field bokeh blur, and kaleidoscopic petal folding.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous forward plunge velocity through mandala gates
 *    audioKick    -> triggers gate puncture shatter & radial shockwave expansion
 *    audioCentroid-> modulates mandala petal symmetry order & fine filigree
 *    audioSubBass -> expands radial gate aperture breathing
 *    audioChromaHue-> rotates the luminous temple gate palette
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
uniform float speedP;       ///< Speed knob, 0..1.
uniform float petalsP;      ///< Petals knob, 6..12.
uniform float gateSpacingP; ///< Gate spacing knob, 0.8..1.4.
uniform float glowP;        ///< Glow / afterglow knob, 0..1.
uniform float hueP;         ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  2D Mandala SDF ornament function
 *
 * @param p       The point. (in)
 * @param petals  Number of petals. (in)
 * @param tGate   Phase of the ornament's animation. (in)
 *
 * @return
 *   The signed distance (a bound where the shape has no exact one).
 **/
float sdMandala( vec2 p, float petals, float tGate )
{
    float a = atan( p.y, p.x );
    float r = length( p );

    // Multi-fold petal symmetry
    float seg = 3.14159265 / petals;
    a = mod( a + seg * 0.5, seg ) - seg * 0.5;
    a = abs( a );

    vec2 q = vec2( cos( a ), sin( a ) ) * r;

    // Concentric petal ripples
    float petal_pattern = sin( q.x * 16.0 + tGate ) * cos( q.y * 16.0 - tGate );
    float ring1 = abs( r - 0.8 ) - 0.03;
    float ring2 = abs( r - 1.4 ) - 0.04;
    float rings = min( ring1, ring2 );

    float petal_curves = abs( q.y - 0.15 * sin( q.x * 8.0 + tGate ) ) - 0.02;

    return min( rings, petal_curves );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float n_petals = ( petalsP > 1.0 ) ? petalsP : 8.0;
    float spc = ( gateSpacingP > 0.01 ) ? gateSpacingP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.38 * spd + audioAdvance * 0.30 * spd; // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Plunge coordinate along depth Z
    float z_dive = t * 1.5;
    float gate_phase = mod( z_dive, spc );

    vec3  col_acc = vec3( 0.0 );
    float total_weight = 0.0;

    // Accumulate across 7 stacked mandala planes
    for ( int k = 0; k < 7; ++k )
    {
        float kf = float( k );
        float plane_z = ( kf * spc - gate_phase ) + 0.3;

        if ( plane_z <= 0.05 )
            continue; // Behind camera

        // Perspective projection for this plane
        float proj_scale = 1.0 / plane_z;
        vec2  p_plane = uv * plane_z;

        // Plane gate rotation
        float rot_a = t * 0.2 + kf * 0.5;
        float cs = cos( rot_a ), sn = sin( rot_a );
        p_plane = mat2( cs, -sn, sn, cs ) * p_plane;

        // Radial breathing
        p_plane /= ( 1.0 + 0.15 * sin( audioSwell * 2.5 + kf ) + 0.1 * audioSubBass );

        // Center aperture through which camera punches
        float center_rad = length( p_plane );
        float aperture_glow = exp( -abs( center_rad - 0.4 ) * 8.0 );

        // Evaluate mandala geometry
        float d_mandala = sdMandala( p_plane, n_petals, t + kf );
        float line_glow = exp( -abs( d_mandala ) * ( 20.0 + 10.0 * audioCentroid ) ) * glw;

        // Depth fading and bokeh blur attenuation
        float depth_fade = smoothstep( 6.0, 1.5, plane_z ) * smoothstep( 0.1, 0.4, plane_z );

        // Sample texture on gate plane
        vec2 sample_uv = fract( p_plane * 0.3 + 0.5 );
        vec3 tex_col = img( sample_uv );
        vec3 pal_col = imgPalette( kf * 0.15 + t * 0.05 );

        vec3 plane_col = mix( tex_col, pal_col, 0.45 );

        // Add glowing filigree and gate aperture
        vec3 filigree = vec3( 1.3, 1.1, 1.7 ) * ( line_glow + aperture_glow * 0.5 ) * ( 1.0 + 2.5 * audioKick );
        plane_col += filigree;

        col_acc += plane_col * depth_fade;
        total_weight += depth_fade;
    }

    vec3 final_col = col_acc / max( 0.001, total_weight );

    // Shockwave burst in center
    float shockwave = abs( sin( length( uv ) * 15.0 - t * 6.0 ) );
    final_col += imgPalette( 0.8 ) * smoothstep( 0.9, 1.0, shockwave ) * 0.4 * audioKick;

    final_col = pow( final_col, vec3( 0.88 ) );
    final_col *= 0.71; // measured luma 0.702: knee, not a linear trim
    final_col /= 1.0 + 0.45 * max( final_col.r, max( final_col.g, final_col.b ) );
    fragColor = vec4( clamp( final_col * 0.86, 0.0, 1.0 ), 1.0 ); // measured luma 0.748: over the white line
}
