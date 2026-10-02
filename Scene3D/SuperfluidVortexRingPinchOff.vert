#version 330 core
/**
 * @file SuperfluidVortexRingPinchOff.vert
 * @brief Vertex stage companion to SuperfluidVortexRingPinchOff.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = world pos, attrA.w = depthNorm
// attrB.w   = pinchGlow
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

out vec3 vPos;   ///< Position (from the vertex stage).
out float vDepth;   ///< Depth (from the vertex stage).
out float vGlow;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vDepth = attrA.w;
    vGlow = attrB.w;

    // Stereoscopic 3D camera projection (V3).
    // The old code tilted the view AFTER pushing the scene down the view axis,
    // which rotated the camera distance itself into a 2.35-unit drop -- the
    // whole ring tangle sat below the bottom edge of the frame.  The generator
    // now gives every ring its own axis (a far better tumble than one global
    // tilt), so this stage is a straight translation and the tangle stays
    // centred.  kCam MUST match the constant of the same name in
    // SuperfluidVortexRingPinchOff.comp, which lays the rings out in frustum
    // coordinates against it.
    const float kCam = 4.5;
    vec3 vp = worldP;
    vp.z += kCam;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // Every ring's drift is a fraction of its own depth, so nothing should
    // reach the near plane -- but cull rather than smear if a preset ever does.
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
