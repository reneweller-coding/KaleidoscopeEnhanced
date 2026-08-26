#version 330 core
/**
 * @file ExoticStation.vert
 * @brief Vertex stage companion to ExoticStation.frag -- see that file's
 * header. Shared by the five one-of-a-kind stations (biosphere, diplomatic
 * seat, solar collector, luxury border post, smuggler hideout): a slow,
 * elegant tumble -- these hulls are distinguished by lighting/color in the
 * fragment stage, not by how they move.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;

uniform float sizeP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;

void main()
{
    float sz = (sizeP > 0.01 ? sizeP : 1.0);
    vec3 local = attrA.xyz * (32.0 * sz);

    float rotY = time * 0.09 + audioAdvance * 0.12;
    float rotX = sin(time * 0.045) * 0.12;
    float cy = cos(rotY), sy = sin(rotY);
    float cx = cos(rotX), sx = sin(rotX);
    mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
    mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
    mat3 rotMat = rotYMat * rotXMat;

    vec3 world = rotMat * local;
    world.z += 105.0;
    world.y += 1.0 * audioKick;

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(rotMat * attrB.xyz);
    vPos = world;
}
