#version 330 core
/*****************************************************************************\
 *                              LorenzAttractorHyperLoom.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  LORENZ ATTRACTOR HYPER LOOM: High-density chaotic Lorenz attractor trajectory field woven into a glowing
 *  butterfly-wing hyper-dimensional loom with orbital particle pulses, chaotic parameter morphing, and volumetric
 *  luminous energy sheets.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous integration of chaotic Lorenz trajectories
 *    audioKick    -> flashes chaotic singularity lobes & shoots particle pulses
 *    audioCentroid-> modulates Rayleigh number rho & trajectory sharpness
 *    audioSubBass -> expands butterfly wing lobe separation
 *    audioChromaHue-> rotates the chaotic attractor rainbow palette
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
uniform float speedP; ///< Speed knob, 0..1.
uniform float rhoP;   ///< Rho knob, 0.8..1.4.
uniform float trailP; ///< Trail knob, 0.7..1.4.
uniform float glowP;  ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float r_mod = ( rhoP > 0.01 ) ? rhoP : 1.0;
    float trl = ( trailP > 0.01 ) ? trailP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.180 * spd + audioAdvance * 0.180 * spd;
    // Time base + music push: audioAdvance ALONE stands still in quiet
    // music (the reported "looks like a still picture" class).

    // Lorenz parameters: sigma = 10, beta = 8/3, rho modulated by audio
    float sigma = 10.0;
    float beta = 2.666666;
    float rho = ( 28.0 + 8.0 * sin( t * 0.4 ) + 6.0 * audioCentroid ) * r_mod;

    // 3D Point projected onto 2D screen coordinate frame
    float rot_a = t * 0.2 + audioPhase * 0.1;
    float cs = cos( rot_a ), sn = sin( rot_a );
    vec2  p_rot = mat2( cs, -sn, sn, cs ) * uv * ( 35.0 + 5.0 * sin( audioSwell * 2.0 ) );

    // Integrated trajectory point simulation (multi-step RK2 integration),
    // seeded from a FIXED point shared by every pixel -- not the pixel's own
    // position -- so the traced curve is one real spatial path instead of
    // every pixel trivially starting AT distance zero from itself (which let
    // the angle-only lobe_phase background dominate the whole frame with a
    // generic pinwheel instead of the intended attractor-wing glow).
    vec3  p_lorenz = vec3( 1.0, 1.0, 25.0 );
    float min_dist = 1e5;
    float energy_acc = 0.0;

    float dt = 0.012 * trl;

    for ( int i = 0; i < 24; ++i )
    {
        // Lorenz ODE derivatives
        float dx = sigma * ( p_lorenz.y - p_lorenz.x );
        float dy = p_lorenz.x * ( rho - p_lorenz.z ) - p_lorenz.y;
        float dz = p_lorenz.x * p_lorenz.y - beta * p_lorenz.z;

        p_lorenz += vec3( dx, dy, dz ) * dt;

        // Project 3D Lorenz attractor onto screen plane. Sub-bass widens the
        // projection, driving the two fixed-point lobes apart on screen; done
        // here rather than on beta so the ODE integration itself stays at its
        // tuned, stable parameters.
        vec2  p_proj = p_lorenz.xy * ( 1.0 + 0.35 * audioSubBass ) - vec2( 0.0, 5.0 );
        float d = length( p_rot - p_proj );
        min_dist = min( min_dist, d );
        energy_acc += exp( -d * 0.4 );
    }

    // Dynamic texture sample mapped on attractor coordinates
    vec2 sample_uv = fract( p_rot * 0.05 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing trajectory ribbon lines
    float line_glow = exp( -min_dist * ( 1.2 + 0.8 * audioCentroid ) ) * glw;

    // Palette mixing across Lorenz lobes
    float lobe_phase = atan( p_rot.y, p_rot.x ) / 6.2831853 + length( p_rot ) * 0.02;
    vec3  pal_a = imgPalette( lobe_phase + t * 0.05 );
    vec3  pal_b = imgPalette( lobe_phase + 0.5 );
    vec3  col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( energy_acc * 0.3 ) );

    col = mix( col, tex_col, 0.35 + 0.15 * audioValence );

    // Add glowing attractor wings and kick flashes
    vec3 wing_tint = vec3( 1.3, 1.1, 1.8 ) * ( line_glow + energy_acc * 0.05 ) * ( 1.0 + 2.5 * audioKick );
    col += wing_tint;

    col = pow( col, vec3( 0.88 ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
