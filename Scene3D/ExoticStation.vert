#version 330 core
/**
 * @file ExoticStation.vert
 * @brief Vertex stage companion to ExoticStation.frag -- see that file's
 * header. Shared by the five one-of-a-kind stations (biosphere, diplomatic
 * seat, solar collector, luxury border post, smuggler hideout): a slow,
 * elegant tumble -- these hulls are distinguished by lighting/color and
 * backdrop in the fragment stage, not by how they move -- on top of which
 * the camera ALSO does its own cinematic sweep (this scene's rig* formulas
 * in Configurations/Komplett.xml); the two are independent, not a
 * trade-off. gl_VertexID picks the vertex's own branch: below
 * meshVertexCount it is the loaded model, at or above it the enclosing sky
 * shell Scene3DShader::buildGeometry() appends -- ExoticStation.frag paints
 * one of several backdrops onto it, chosen per-instance via bgTypeP.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky direction").

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;

uniform float audioAdvance;
uniform float audioKick;

uniform float sizeP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;
out float vBg;

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;
    if( !isBg )
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

        world = rotMat * local;
        world.z += 105.0;
        world.y += 1.0 * audioKick;
        n = normalize(rotMat * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
