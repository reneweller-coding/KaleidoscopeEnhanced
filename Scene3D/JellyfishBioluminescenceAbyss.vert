#version 330 core
/**
 * @file JellyfishBioluminescenceAbyss.vert
 * @brief Vertex stage companion to JellyfishBioluminescenceAbyss.frag -- see that file's header for
 * this scene's description.
 */
// attrA.xyz = world pos (baked by the compute generator), attrA.w = tentacleIdx
// attrB.w   = bioGlow (Scene3DShader.cpp GEOM_INDIRECT, 8-float vertex layout)
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).

out vec3 vPos;   ///< Position (from the vertex stage).
out float vTentacle;
out float vBioGlow;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vTentacle = attrA.w;
    vBioGlow = attrB.w;

    // Stereoscopic 3D camera projection
    vec3 vp = worldP;
    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
