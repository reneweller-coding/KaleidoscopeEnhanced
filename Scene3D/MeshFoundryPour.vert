#version 330 core
/**
 * @file MeshFoundryPour.vert
 * @brief Vertex stage companion to MeshFoundryPour.frag -- see that file's
 * header. Two models: the sand mould (model=) on the foundry floor, and the
 * ladle (model2=) hanging above it, tipping toward the mould on the scene
 * clock -- a rotation about its trunnion axis, eased, and back up again at
 * the end. The lip's and the cup's world positions go to the fragment
 * stage, which paints the stream between them on the shell.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform int   mesh2VertexCount;
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.
uniform vec3  meshExtent2;
uniform vec3  meshCenter2;
uniform float sceneProgress;   ///< Progress through this scene's solo time, 0..1.

uniform float sizeP;   ///< Size knob, 0..1.
uniform float ladleP;     ///< ladle size relative to the mould (default 0.8)
uniform float lipP;       ///< the ladle's yaw, to bring its lip toward the mould (radians)

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vLocal;   ///< Object-space position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).
out float vLadle;
out float vPour;
out vec3  vLip;
out vec3  vCup;

const float kDist   = 48.0;
const float kGround = -18.0;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    bool isMould = gl_VertexID <  meshVertexCount;
    bool isLadle = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool isBg    = gl_VertexID >= mesh2VertexCount;
    vec3 world, n;
    vLadle = isLadle ? 1.0 : 0.0;

    float sz = 11.0 * (sizeP > 0.01 ? sizeP : 1.0);
    float mxM = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
    vec3 mouldHalf = meshExtent / mxM * sz;
    vec3 mouldPos = vec3(4.0, kGround + mouldHalf.y, kDist);
    vCup = mouldPos + vec3(0.0, mouldHalf.y, -mouldHalf.z * 0.2);

    // The pour: tips over the middle of the scene, rights itself at the end.
    float pour = smoothstep(0.12, 0.45, sceneProgress) * (1.0 - smoothstep(0.82, 0.98, sceneProgress));
    vPour = pour;
    float szL = sz * (ladleP > 0.01 ? ladleP : 0.8);
    float mxL = max(meshExtent2.x, max(meshExtent2.y, meshExtent2.z));
    vec3 ladleHalf = meshExtent2 / mxL * szL;
    vec3 ladlePos = vec3(-13.0, kGround + 2.0 * mouldHalf.y + ladleHalf.y * 0.6 + 3.0, kDist - 2.0);
    float tilt = 1.05 * pour;
    float ct = cos(tilt), st = sin(tilt);
    mat3 tiltM = mat3(ct, st, 0.0,  -st, ct, 0.0,  0.0, 0.0, 1.0);     // tips toward +x, toward the mould
    float cy = cos(3.14159265 + lipP), sy = sin(3.14159265 + lipP);
    mat3 yawM = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
    // The lip: the ladle's +x rim, after the tilt.
    vLip = tiltM * vec3(ladleHalf.x * 0.95, ladleHalf.y * 0.8, 0.0) + ladlePos;

    const mat3 turnM = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);
    if (isMould)
    {
        vec3 c = attrA.xyz - meshCenter;
        world = turnM * (c / mxM * sz) + mouldPos;
        n = normalize(turnM * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent;
    }
    else if (isLadle)
    {
        vec3 c = attrA.xyz - meshCenter2;
        mat3 M = tiltM * yawM;
        world = M * (c / mxL * szL) + ladlePos;
        n = normalize(M * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent2;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocal = vec3(0.0);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
