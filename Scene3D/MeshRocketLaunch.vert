#version 330 core
/**
 * @file MeshRocketLaunch.vert
 * @brief Vertex stage companion to MeshRocketLaunch.frag -- see that file's
 * header. Two loaded meshes and the sky shell, picked by gl_VertexID:
 *   [0, meshVertexCount)                 the launch pad (model=), still, on the ground
 *   [meshVertexCount, mesh2VertexCount)  the rocket (model2=), standing on the pad, then climbing
 *   [mesh2VertexCount, ...)              the sky shell
 *
 * Both meshes arrive normalised to a unit box, so their relative size is set
 * HERE from real proportions (a 65 m rocket beside a 75 m tower), not read
 * from the files. The liftoff is staged on sceneProgress: the engines light
 * just before the liftoff mark, then the climb accelerates for the rest of
 * the scene -- so the launch happens once and is over before the scene is,
 * whatever length the scheduler rolled for it. Nothing here moves on a fast
 * envelope: the burn is light, the climb is the clock.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction.

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform int   mesh2VertexCount;
uniform vec3  meshExtent;     // half-extents of the pad, object space
uniform vec3  meshCenter;
uniform vec3  meshExtent2;    // half-extents of the rocket
uniform vec3  meshCenter2;
uniform float sceneProgress;

uniform float sizeP;
uniform float platP;    // the pad's platform height as a fraction of the pad's full height
uniform float offP;     // rocket offset across the pad, as a fraction of the pad's half-width
uniform float depthP;   // rocket offset into the pad, as a fraction of the pad's half-depth
uniform float liftP;    // 0..1: where in the scene the liftoff falls

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;     // object space, normalised to -1..1 per axis
out float vBg;
out float vRocket;
out vec4  vFlame;     // xyz = the engines' world position, w = burn 0..1
out float vClimb;     // 0 on the pad, 1 at the top of the climb

const float kDist   = 84.0;   // the pad's distance from the camera
const float kGround = -16.0;  // ground height: the pad sits low so the sky above has room for the climb

void main()
{
    bool isPad    = gl_VertexID <  meshVertexCount;
    bool isRocket = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool isBg     = gl_VertexID >= mesh2VertexCount;

    float sz   = (sizeP > 0.01 ? sizeP : 1.0);
    float padH = 40.0 * sz;                          // the pad's full height in world units
    float sPad = padH / (2.0 * meshExtent.y);
    float plat = (platP > 0.001 ? platP : 0.30);

    // Liftoff staging on the scene's own arc. Early enough that a scene the
    // scheduler cuts short still gets its launch: at 0.42..0.54 the
    // catalogue probe's own section cut re-armed the scene before the climb
    // and showed the rocket back on the pad.
    float p0    = 0.34 + 0.12 * clamp(liftP, 0.0, 1.0);
    float u     = clamp((sceneProgress - p0) / max(1.0 - p0, 0.05), 0.0, 1.0);
    float burn  = smoothstep(p0 - 0.07, p0, sceneProgress);
    float climb = 110.0 * u * u * (0.55 + 0.45 * u);   // accelerating, as a launch does
    float tilt  = -0.09 * u * u;                        // the gravity turn, barely begun

    // The rocket's frame is needed by every branch: the pad and the shell
    // are lit by its engines.
    float rocketH = padH * 0.87;
    float sR = rocketH / (2.0 * meshExtent2.y);
    float platY = kGround + padH * plat;
    vec3 rocketBase = vec3(offP * meshExtent.x * sPad, platY, kDist + depthP * meshExtent.z * sPad);
    vec3 basePos = rocketBase + vec3(climb * 0.5 * tilt, climb, 0.0);
    float ct = cos(tilt), st = sin(tilt);
    mat3 tiltM = mat3(ct, st, 0.0,  -st, ct, 0.0,  0.0, 0.0, 1.0);

    vFlame  = vec4(basePos, burn);
    vClimb  = u;
    vRocket = isRocket ? 1.0 : 0.0;

    vec3 world, n;
    if (isPad)
    {
        // The generator builds a model facing ITS camera, the mesh's +Z,
        // which points away from ours: a half turn shows the pad's front.
        const mat3 padYaw = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);
        vec3 c = padYaw * (attrA.xyz - meshCenter);
        world = c * sPad + vec3(0.0, kGround + meshExtent.y * sPad, kDist);
        n = normalize(padYaw * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent;
    }
    else if (isRocket)
    {
        vec3 c = attrA.xyz - meshCenter2;
        vec3 local = c * sR;
        local.y += meshExtent2.y * sR;              // pivot at the base, on the platform
        world = tiltM * local + basePos;
        n = normalize(tiltM * attrB.xyz);
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
    // Shell depth pinned just inside the far plane (standard skybox fix).
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
