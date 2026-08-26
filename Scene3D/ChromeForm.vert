#version 330 core
/**
 * @file ChromeForm.vert
 * @brief Vertex stage for ChromeForm.frag. geom="mesh".
 *
 * A mirror shows its surroundings, not itself, so the only thing this stage
 * has to get right is that the surface keeps TURNING: a static mirror is a
 * still picture of a room. The turn is slow and about one axis, because what
 * the eye follows here is the reflection sliding across the form, and a tumble
 * would scramble that into noise.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float audioAdvance;
uniform float audioSwell;

uniform float sizeP;
uniform float spinP;

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out float vBg;

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;

    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 p = attrA.xyz - meshCenter;
        float fit = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);

        float rotY = time * 0.13 * spinP + audioAdvance * 0.05 * spinP;
        float rotX = 0.22 + 0.05 * sin(time * 0.07);
        float cy = cos(rotY), sy = sin(rotY);
        float cx = cos(rotX), sx = sin(rotX);
        mat3 spin = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
        mat3 tilt = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
        mat3 rot = tilt * spin;

        world = rot * (p * (80.0 * sz * fit * (1.0 + 0.025 * audioSwell)));
        world.z += 72.0;
        n = normalize(rot * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vBg = 0.0;
    }
    else
    {
        world = attrA.xyz;
        n = normalize(attrB.xyz);
        vUV = vec2(0.0);
        vBg = 1.0;
    }

    vNormal = n;
    vPos = world;

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    if( isBg ) gl_Position.z = gl_Position.w * 0.999999;
}
