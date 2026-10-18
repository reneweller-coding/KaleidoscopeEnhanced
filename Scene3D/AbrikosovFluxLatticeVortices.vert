#version 330 core
/*****************************************************************************\
 *                              AbrikosovFluxLatticeVortices.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to AbrikosovFluxLatticeVortices.frag -- see that file's header for this scene's
 *  description.
 *
 *  @author René Weller
 */
layout( location = 0 ) in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g.
                                      ///< position or u/v and an index).
layout( location = 1 ) in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element
                                      ///< seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since this activation, plus a rolled start (see sceneTime).

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

uniform float fluxP;      ///< Flux knob, 0.5..2.
uniform float kelvinP;    ///< Kelvin knob, 0.5..2.
uniform float speedP;     ///< Speed knob, 0..1.
uniform float hueP;       ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform vec2  resolution; ///< Size of the render target in pixels (point sprites scale with it).

out vec3  vWorldPos;    ///< World position (from the vertex stage).
out float vVortexPhase; ///< Vortex phase (from the vertex stage).

float PointScale = 1.0; ///< The render height over 1080 (set first thing in main()).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    // Sized for 1080p and scaled to the render size (17.10.2026): in pixels alone, the sprites covered 2.25 times
    // the picture at 720p -- where the adaptive resolution goes when the GPU is busy -- and ran into a flat sheet.
    PointScale = resolution.y > 0.0 ? resolution.y / 1080.0 : 1.0;
    float flx = ( fluxP > 0.0 ) ? fluxP : 1.0;
    float klv = ( kelvinP > 0.0 ) ? kelvinP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;

    int   particle_idx = gl_VertexID;
    float p_norm = float( particle_idx ) / 60000.0;
    vVortexPhase = p_norm;

    float t = time * 0.45 * spd + audioAdvance * 0.22;

    // 200 vortices each with 300 points along Z-axis
    int   vortex_id = particle_idx / 300;
    float z_norm = float( particle_idx % 300 ) / 300.0; // [0, 1]
    float z = ( z_norm - 0.5 ) * 4.5;

    // Triangular Abrikosov lattice base coordinates (hexagonal packing)
    float row = float( vortex_id / 14 );
    float col = float( vortex_id % 14 );
    float hex_x = ( col + mod( row, 2.0 ) * 0.5 - 7.0 ) * 0.35 * flx;
    float hex_y = ( row - 7.0 ) * 0.303 * flx;

    // Helical Kelvin wave excitations along the vortex core: r_k(z, t)
    float kelvin_wave = sin( z * 6.0 * klv - t * 5.0 + float( vortex_id ) * 0.5 );
    float kelvin_cos = cos( z * 6.0 * klv - t * 5.0 + float( vortex_id ) * 0.5 );
    float wave_amp = ( 0.06 + 0.04 * audioBass ) * ( 1.0 + audioKick * 0.8 );

    vec3 world_pos = vec3( hex_x + kelvin_wave * wave_amp, hex_y + kelvin_cos * wave_amp, z );
    vWorldPos = world_pos;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view).
    // Without the push-back only the half of the lattice that happened to fall
    // beyond the near plane was ever visible.
    vec3 vp = world_pos;
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point sprite size
    // sprite sweep 2026-08-22: measured luma 0.016, area x4.8
    gl_PointSize = PointScale
                   * ( clamp( ( 39.6 / max( gl_Position.w, 0.4 ) ) * ( 1.0 + audioKick * 1.2 ), 2.0, 64.0 ) );
}
