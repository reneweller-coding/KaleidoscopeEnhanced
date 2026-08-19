#version 330 core
/**
 * @file RadiolarianMicrotubuleExoskeleton.vert
 * @brief Vertex stage companion to RadiolarianMicrotubuleExoskeleton.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = world pos, attrA.w = radiusNorm
// attrB.w   = silicaGlow
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

out vec3 vPos;
out float vRadius;
out float vGlow;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vRadius = attrA.w;
    vGlow = attrB.w;

    // Stereoscopic 3D camera projection (V3).  The spin must happen
    // BEFORE the camera translate: applied after it, the scene orbits
    // around the CAMERA (radius = the z offset) and spends most of the
    // revolution outside the frustum.
    vec3 vp = worldP;

    // Smooth rotation in 3D
    float t = time * 0.15;
    float c = cos(t), s = sin(t);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.8;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
