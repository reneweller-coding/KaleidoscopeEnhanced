#version 330 core
/**
 * @file Aperture.vert
 * @brief Vertex stage companion to Aperture.frag. geom="mesh"; see
 * Tools/SHADER_AUTHORING.md's `mesh` row for the attribute contract.
 *
 * The model is not lit here and its surface detail never shows -- it is used
 * purely as a SHAPE. So this stage only has to put a big, well-framed
 * silhouette on screen and keep it turning slowly enough that the outline
 * stays readable while it changes.
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

out vec3  vNormal;
out vec3  vPos;
out vec3  vLocalPos;
out float vBg;

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;

    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        vec3 p = attrA.xyz - meshCenter;

        // Fill the frame. A silhouette that does not dominate is just a small
        // dark blob, and the whole point is that the shape IS the composition.
        float fit = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);

        float rotY = time * 0.11 * spinP + audioAdvance * 0.05 * spinP;
        float cy = cos(rotY), sy = sin(rotY);
        mat3 spin = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
        const float tiltX = 0.10;
        float cx = cos(tiltX), sx = sin(tiltX);
        mat3 tilt = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
        mat3 rot = tilt * spin;

        world = rot * (p * (96.0 * sz * fit * (1.0 + 0.03 * audioSwell)));
        world.z += 74.0;
        n = normalize(rot * attrB.xyz);
        vLocalPos = p;
        vBg = 0.0;
    }
    else
    {
        world = attrA.xyz;
        n = normalize(attrB.xyz);
        vLocalPos = vec3(0.0);
        vBg = 1.0;
    }

    vNormal = n;
    vPos = world;

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    if( isBg ) gl_Position.z = gl_Position.w * 0.999999;
}
