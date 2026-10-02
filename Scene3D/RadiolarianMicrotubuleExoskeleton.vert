#version 330 core
/**
 * @file RadiolarianMicrotubuleExoskeleton.vert
 * @brief Vertex stage companion to RadiolarianMicrotubuleExoskeleton.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = world pos, attrA.w = radiusNorm
// attrB.w   = silicaGlow
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

out vec3 vPos;   ///< Position (from the vertex stage).
out float vRadius;
out float vGlow;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vRadius = attrA.w;
    vGlow = attrB.w;

    // Stereoscopic 3D camera projection (V3).
    //
    // The skeleton's spin used to be applied HERE, about the world origin.  That
    // was fine while a single radiolarian sat on that origin, but the generator
    // now lays a whole bloom out across the frustum, and a world-origin rotation
    // would swing every one of them through a huge orbit and out of frame.  Each
    // skeleton therefore turns about its OWN centre inside the .comp, and this
    // stage is a straight camera transform.
    vec3 vp = worldP;
    vp.z += 4.8;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
