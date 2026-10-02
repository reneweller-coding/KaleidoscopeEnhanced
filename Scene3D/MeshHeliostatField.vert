#version 330 core
/**
 * @file MeshHeliostatField.vert
 * @brief Vertex stage companion to MeshHeliostatField.frag -- see that
 * file's header. Two models and the shell, drawn instances="N" times:
 *   [0, meshVertexCount)                 the receiver tower (model=), instance 0 only
 *   [meshVertexCount, mesh2VertexCount)  one heliostat (model2=), placed by gl_InstanceID
 *   [mesh2VertexCount, ...)              the sky shell, instance 0 only
 * The other instances collapse the tower and the shell to a point.
 *
 * Every heliostat is aimed the way a real one is: its mirror normal
 * bisects the direction to the sun and the direction to the receiver, so
 * the field is a ring pattern of tilted panels. The sun creeps across the
 * sky on time, and the panels track it. The mirror model's panel faces
 * its own +Z (the generator's camera side); the rotation below takes +Z
 * to the aiming normal. The pedestal tilts with the panel, which is wrong
 * by a few degrees and invisible at this size.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform int   mesh2VertexCount;
uniform int   meshInstances;   ///< Number of mesh instances.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.
uniform vec3  meshExtent2;
uniform vec3  meshCenter2;

uniform float sizeP;   ///< Size knob, 0..1.
uniform float mirrorP;    ///< heliostat size relative to the tower (default 1)

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vLocal;   ///< Object-space position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).
out float vMirror;
out vec3  vAim;      ///< the heliostat's aiming normal (world): its glass is the face that points this way

const float kGround = -6.0;
const vec3  kTowerFoot = vec3(0.0, kGround, 170.0);
const float kTowerH = 70.0;

vec3 sunDir()
{
    float a = 0.4 + 0.10 * sin(time * 0.017);
    float e = 0.62 + 0.06 * sin(time * 0.011);
    return normalize(vec3(sin(a) * cos(e), sin(e), -cos(a) * cos(e)));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    int inst = gl_InstanceID;
    int N = max(meshInstances, 1);
    bool isTower  = gl_VertexID <  meshVertexCount;
    bool isMirror = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool isBg     = gl_VertexID >= mesh2VertexCount;

    float sz = (sizeP > 0.01 ? sizeP : 1.0);
    vec3 world, n;
    vMirror = isMirror ? 1.0 : 0.0;
    vAim = vec3(0.0, 1.0, 0.0);

    if ((isTower || isBg) && inst > 0)
    {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        vNormal = vec3(0.0, 1.0, 0.0); vPos = vec3(0.0); vUV = vec2(0.0); vLocal = vec3(0.0);
        vBg = isBg ? 1.0 : 0.0;
        return;
    }

    if (isTower)
    {
        float szT = 0.5 * kTowerH * sz;
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * szT;
        const mat3 turnM = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);
        world = turnM * local + kTowerFoot + vec3(0.0, meshExtent.y / mx * szT, 0.0);
        n = normalize(turnM * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent;
    }
    else if (isMirror)
    {
        float k = float(inst);
        // The field: quasi-random angle over the near 220 degrees, radius
        // spread as sqrt for an even density, never inside the tower's ring.
        float a = (fract(k * 0.6180340) - 0.5) * 3.8;
        float r = 26.0 + 118.0 * sqrt(fract(k * 0.7548777 + 0.31));
        vec3 pos = kTowerFoot + vec3(r * sin(a), 0.0, -r * cos(a));

        float szM = 2.2 * sz * (mirrorP > 0.01 ? mirrorP : 1.0);
        vec3 c  = attrA.xyz - meshCenter2;
        float mx = max(meshExtent2.x, max(meshExtent2.y, meshExtent2.z));
        vec3 local = c / mx * szM;

        vec3 recv = kTowerFoot + vec3(0.0, kTowerH * 0.82, 0.0);
        vec3 toRecv = normalize(recv - pos);
        vec3 nrm = normalize(toRecv + sunDir());
        vAim = nrm;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), nrm));
        vec3 up2 = cross(nrm, right);
        mat3 aimM = mat3(right, up2, nrm);

        world = aimM * local + pos + vec3(0.0, meshExtent2.y / mx * szM, 0.0);
        n = normalize(aimM * attrB.xyz);
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
