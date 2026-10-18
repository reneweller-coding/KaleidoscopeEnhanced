#version 330 core
/*****************************************************************************\
 *                              QuantumWavepacketCollapse.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to QuantumWavepacketCollapse.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */
// GEOM_POINTS supplies no meaningful position (attrA.xyz is always zero;
// only attrA.w = point id and attrB = 4 per-point hash seeds are real —
// see Scene3DShader.cpp). A pseudo-random seed point takes the place of the
// "inPos" this shader originally expected as an arbitrary base position.
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;        ///< Projection matrix.
uniform float eyeOff;       ///< Stereo eye offset (0 in mono).
uniform float time;         ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;    ///< Bass band level, 0..1.
uniform float audioMid;     ///< Mid band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform vec2  resolution;   ///< Size of the render target in pixels (point sprites scale with it).

out vec3  vPos;   ///< Position (from the vertex stage).
out float vProb;  ///< Prob (from the vertex stage).
out float vPhase; ///< Phase (from the vertex stage).

/**  Pseudo-random number 0..1 from a float.
 *
 * @param p  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float p )
{
    p = fract( p * 0.1031 );
    p *= p + 19.19;
    p *= p + p;
    return fract( p );
}

float PointScale = 1.0; ///< The render height over 1080 (set first thing in main()).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    // Sized for 1080p and scaled to the render size (17.10.2026): in pixels alone, the sprites covered 2.25 times
    // the picture at 720p -- where the adaptive resolution goes when the GPU is busy -- and ran into a flat sheet.
    PointScale = resolution.y > 0.0 ? resolution.y / 1080.0 : 1.0;
    float id = attrA.w;
    float seed = hash11( id );
    vec3  seed_pos = attrB.xyz * 2.0 - 1.0;

    // Spherical coordinates of 3D quantum eigenstate harmonic oscillator
    float r = length( seed_pos ) * 2.5;
    float theta = acos( clamp( seed_pos.z / max( r, 0.001 ), -1.0, 1.0 ) );
    float phi = atan( seed_pos.y, seed_pos.x );

    // Superposition of spherical harmonics Y_lm and radial Laguerre modes
    float t = time * 0.5 + audioAdvance * 0.2;
    float mode1 = sin( r * 3.0 - t * 2.0 ) * cos( theta * 2.0 );
    float mode2 = cos( r * 4.0 - t * 3.0 + phi * 3.0 ) * sin( theta * 3.0 );
    float mode3 = sin( r * 6.0 - t * 4.0 - phi * 2.0 );

    // Complex probability amplitude psi
    float psi_re = mode1 + mode2 * 0.7;
    float psi_im = mode3 + mode1 * 0.5;
    float prob = ( psi_re * psi_re + psi_im * psi_im ) * ( 0.8 + 0.4 * audioSwell );
    float q_phase = atan( psi_im, psi_re );

    // Beat transient triggers localized wavepacket collapse towards a nodal singularity
    vec3  collapse_center = vec3( sin( t * 0.7 ) * 1.5, cos( t * 0.5 ) * 1.2, sin( t * 0.3 ) * 1.0 );
    float collapse_amount = audioKick * 0.7;

    vec3 pos = mix( seed_pos * ( 1.5 + 0.8 * prob ),
                    collapse_center + normalize( seed_pos - collapse_center ) * ( 0.3 + 0.5 * seed ), collapse_amount );

    vPos = pos;
    vProb = prob;
    vPhase = q_phase;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Small cap on purpose: the collapsed packet stacks thousands of sprites
    // on one spot — area is the exposure control (kick x6 burned it white).
    gl_PointSize = ( clamp( ( 2.0 + 3.0 * prob + audioKick * 1.5 ) * ( 6.0 / vp.z ), 1.0, 12.0 ) ) * PointScale;
}
