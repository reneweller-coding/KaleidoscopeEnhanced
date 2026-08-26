#version 330 core
/**
 * @file IndustrialStation.vert
 * @brief Vertex stage companion to IndustrialStation.frag -- see that
 * file's header. Shared by every mining/refinery/salvage station
 * (geom="mesh"): an uneven, slightly juddering tumble -- machinery running
 * under load, not a smooth showroom turntable.
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

    // A small high-frequency judder riding on top of the base tumble --
    // reads as heavy machinery vibration rather than a clean spin.
    float judder = sin(time * 9.0) * 0.02 + sin(time * 23.0) * 0.01;
    float rotY = time * 0.09 + audioAdvance * 0.18 + judder;
    float rotX = 0.12 + sin(time * 0.11) * 0.05;
    float cy = cos(rotY), sy = sin(rotY);
    float cx = cos(rotX), sx = sin(rotX);
    mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
    mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
    mat3 rotMat = rotYMat * rotXMat;

    vec3 world = rotMat * local;
    world.z += 100.0;
    world.y += 1.0 * audioKick;

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(rotMat * attrB.xyz);
    vPos = world;
}
