#version 330 core
/*****************************************************************************\
 *                              CyberspaceDNAHelix.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to CyberspaceDNAHelix.frag -- see that file's header for this scene's description.
 *
 *  Audio Reactivity:
 *    audioAdvance   -> helix twist phase (pre-integrated, jump-free)
 *    audioKick      -> transcription-pulse flash + backbone ribbon thickness
 *    audioSwell     -> width of the unzipping replication fork
 *    audioHarmChange-> a chord/key change forces the strands further apart --
 *                      the fork tears open on every harmonic turn
 *    audioUpperMid  -> 2-6 kHz metallic edge focuses the transcription
 *                      read-head from a broad wash to a razor scan line
 *    audioMode      -> (fragment stage) warm/cold nucleotide palette
 *
 *  @author René Weller
 */
// attrA.x = t along ribbon (0..1), attrA.y = side (-1..+1), attrA.w = ribbon
// id, attrB = per-ribbon seeds (Scene3DShader.cpp GEOM_RIBBON).
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;           ///< Projection matrix.
uniform float eyeOff;          ///< Stereo eye offset (0 in mono).
uniform float time;            ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float audioPhase;      ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;    ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                               ///< backwards).
uniform float audioKick;       ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;       ///< Bass band level, 0..1.
uniform float audioMid;        ///< Mid band level, 0..1.
uniform float audioHigh;       ///< High band level, 0..1.
uniform float audioSwell;      ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHarmChange; ///< spikes on chord / key changes
uniform float audioUpperMid;   ///< 2-6 kHz metallic / industrial edge

out vec3  vPos;           ///< Position (from the vertex stage).
out vec2  vUV;            ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vStrandID;      ///< Strand ID (from the vertex stage).
out float vTranscription; ///< Transcription (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float ribbon_id = attrA.w;
    float t_along = attrA.x * 20.0; // Travel down DNA macromolecule axis

    float t = time * 0.4 + audioAdvance * 0.2;
    float helix_angle = t_along + t;

    // Major double-helix backbone strands vs base-pair hydrogen bridge rungs
    float radius = 1.6;
    float is_strand_b = ( ribbon_id >= 10.0 ) ? 1.0 : 0.0;
    float strand_phase = ( is_strand_b > 0.5 ) ? 3.14159265 : 0.0;

    // Unzipping replication fork at center — every chord/key change tears the
    // strands further apart, so the helix "re-reads" itself on each harmonic
    // turn and closes again as the new harmony settles.
    float unzip = exp( -pow( t_along - 10.0, 2.0 ) * 0.1 )
                  * ( 0.8 + 0.5 * audioSwell + 0.6 * clamp( audioHarmChange, 0.0, 1.0 ) );
    float r = radius * ( 1.0 + unzip );

    float x = r * cos( helix_angle + strand_phase );
    float y = ( attrA.x - 0.5 ) * 8.0;
    float z = r * sin( helix_angle + strand_phase );

    vec3 helix_pos = vec3( x, y, z );

    // Ribbon cross-section width
    vec3 tangent = normalize( vec3( -sin( helix_angle + strand_phase ), 0.4, cos( helix_angle + strand_phase ) ) );
    vec3 normal = vec3( 0.0, 1.0, 0.0 );

    float width = ( 0.075 + 0.03 * sin( t_along * 4.0 ) ) * ( 1.0 + audioKick * 0.5 );
    vec3  pos = helix_pos + normal * ( attrA.y * 0.5 ) * width;

    // Transcription pulse traveling along DNA.  The 2-6 kHz metallic edge
    // focuses the read-head: a dull mix smears it into a broad glowing wash,
    // an industrial-bright one cuts it to a razor scan line.  The travel RATE
    // is audio-free; only the falloff width moves (and tightening only ever
    // removes glow, never adds).
    float pulse_tight = 2.0 * ( 1.0 + 1.3 * clamp( audioUpperMid, 0.0, 1.0 ) );
    float trans_pulse = exp( -abs( t_along - mod( time * 6.0, 20.0 ) ) * pulse_tight ) * ( 1.0 + audioKick * 2.5 );

    vPos = pos;
    vUV = vec2( attrA.x, attrA.y * 0.5 + 0.5 );
    vStrandID = ribbon_id / 20.0;
    vTranscription = trans_pulse;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 7.4; // 4.6 put the camera inside the helix (two fat white bands)
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
