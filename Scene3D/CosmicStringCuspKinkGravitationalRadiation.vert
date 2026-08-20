#version 330 core
/**
 * @file CosmicStringCuspKinkGravitationalRadiation.vert
 * @brief Vertex stage companion to CosmicStringCuspKinkGravitationalRadiation.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = VIEW-space position, attrA.w = parameter along the loop
// attrB.x   = transverse coordinate across the cord (-1 .. +1)
// attrB.w   = cuspGlow
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

out vec3 vPos;
out float vDepth;
out float vGlow;
out float vSideT;

void main() {
    vec3 vp = attrA.xyz;
    vPos = vp;
    vDepth = attrA.w;
    vSideT = attrB.x;
    vGlow = attrB.w;

    // The generator now lays the whole network out in VIEW space (frustum
    // coordinates, so the loops stay evenly spread at every depth), which
    // makes this stage a pass-through: the old tilt-then-translate rig would
    // swing the far half of the network straight out of the picture.
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
