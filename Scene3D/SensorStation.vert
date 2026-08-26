#version 330 core
/**
 * @file SensorStation.vert
 * @brief Vertex stage companion to SensorStation.frag -- see that file's
 * header. Shared by every science/sensor/comms station (geom="mesh"): a
 * smooth, precise 3-axis tumble -- an instrument orienting itself, not a
 * hull adrift.
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
out vec3 vLocalPos;   // pre-scale object space, for the scan-sweep band in the frag stage

void main()
{
    float sz = (sizeP > 0.01 ? sizeP : 1.0);
    vec3 local = attrA.xyz * (32.0 * sz);

    float rotY = time * 0.11 + audioAdvance * 0.12;
    float rotX = time * 0.045;
    float rotZ = sin(time * 0.02) * 0.15;
    float cy = cos(rotY), sy = sin(rotY);
    float cx = cos(rotX), sx = sin(rotX);
    float cz = cos(rotZ), sz2 = sin(rotZ);
    mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
    mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
    mat3 rotZMat = mat3(cz, sz2, 0.0,  -sz2, cz, 0.0,   0.0, 0.0, 1.0);
    mat3 rotMat = rotZMat * rotYMat * rotXMat;

    vec3 world = rotMat * local;
    world.z += 100.0;
    world.y += 0.8 * audioKick;

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(rotMat * attrB.xyz);
    vPos = world;
    vLocalPos = attrA.xyz;
}
