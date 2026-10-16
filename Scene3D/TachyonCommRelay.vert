#version 330 core
/**
 * @file TachyonCommRelay.vert
 * @brief Vertex stage companion to TachyonCommRelay.frag
 */

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float cubeBudget;

uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.

out vec4 vCol; ///< Colour (from the vertex stage).
out vec3 vCorner;
out vec3 vPos;    ///< Position (from the vertex stage).
out vec3 vNormal; ///< Surface normal (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    if ( cubeBudget < 0.75 && mod( attrA.w, 2.0 ) > 0.5 )
    {
        gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 );
        vCol = vec4( 0.0 );
        vCorner = attrA.xyz;
        return;
    }

    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Relay is formed by several massive rings and a central spire
    float is_spire = step( 0.8, r4 );

    vec3 scale;
    vec3 centre;
    mat3 rot_mat;

    float spin = time * 0.2 + audioAdvance * 0.5;

    if ( is_spire > 0.5 )
    {
        // Central spire, long along Z axis
        scale = vec3( 2.0, 2.0, 10.0 ) * ( 1.0 + r1 );
        float z = ( r2 - 0.5 ) * 200.0;
        centre = vec3( 0.0, 0.0, z );

        rot_mat = mat3(
            cos( spin ), -sin( spin ), 0.0,
            sin( spin ), cos( spin ), 0.0,
            0.0, 0.0, 1.0 );
    }
    else
    {
        // Rings rotating around the spire
        float ring_id = floor( r3 * 4.0 ); // 4 distinct rings
        float radius = 30.0 + ring_id * 15.0;
        float z = ( r3 - 0.5 ) * 80.0;

        float theta = r1 * 6.2831853 + spin * ( ring_id * 0.5 + 1.0 ) * ( mod( ring_id, 2.0 ) > 0.5 ? 1.0 : -1.0 );

        centre = vec3( radius * cos( theta ), radius * sin( theta ), z );
        scale = vec3( 4.0, 1.0, 4.0 ) * ( 1.0 + r2 * 2.0 );

        // Orient ring segments
        vec3 forward = vec3( 0.0, 0.0, 1.0 );
        vec3 up = normalize( vec3( -cos( theta ), -sin( theta ), 0.0 ) ); // face center
        vec3 right = cross( up, forward );

        rot_mat = mat3( right, up, forward );
    }

    vec3 local_pos = attrA.xyz * scale;
    vec3 world = centre + rot_mat * local_pos;

    // Camera travels slowly along the Z axis inside the rings
    float cam_z = time * 8.0 + audioAdvance * 15.0;

    // Wrap around for infinite relay
    // WRAP-SIGN FIX (root cause of this scene's black frames, found via
    // SpaceElevator): projM is handed `-vp.z`, so only world.z > 0 is in
    // front of the camera -- the old [-180, 2] band kept everything except
    // a 2-unit slice BEHIND the lens (a hardcoded-magenta fragment stayed
    // black because nothing was ever rasterised). Wrap AHEAD instead.
    world.z = mod( world.z - cam_z, 200.0 );

    // Cull things behind camera or too far
    if ( world.z < 1.5 || world.z > 170.0 )
    {
        gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 );
        vCol = vec4( 0.0 );
        vCorner = attrA.xyz;
        return;
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    vec3 n_local = vec3( 0.0 );
    if ( abs( attrA.x ) > 0.49 )
        n_local = vec3( sign( attrA.x ), 0.0, 0.0 );
    else if ( abs( attrA.y ) > 0.49 )
        n_local = vec3( 0.0, sign( attrA.y ), 0.0 );
    else
        n_local = vec3( 0.0, 0.0, sign( attrA.z ) );
    vec3 n_world = rot_mat * n_local;

    vCol = vec4( r1, r2, r3, is_spire );
    vCorner = attrA.xyz;
    vPos = world;
    vNormal = n_world;
}
