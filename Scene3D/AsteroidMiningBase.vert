#version 330 core
/**
 * @file AsteroidMiningBase.vert
 * @brief Vertex stage companion to AsteroidMiningBase.frag
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float cubeBudget;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;

out vec4 vCol;
out vec3 vCorner;
out vec3 vPos;
out vec3 vNormal;

void main()
{
    if (cubeBudget < 0.75 && mod(attrA.w, 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Distribute asteroids and base structures around a cylindrical tunnel
    // (a fixed angle/radius per instance, spread out along Z) rather than on
    // an orbiting ring the camera also circles: every other working scene in
    // this codebase flies STRAIGHT along a local Z axis and lets a wrap keep
    // the nearby slice close to the origin (see DysonSphereCore.vert /
    // TachyonCommRelay.vert). The original ring-orbit version computed its
    // own camPos and a 2D "view rotation" to face along the ring's tangent,
    // and no combination of signs on that rotation ever put a meaningful
    // number of instances in front of the camera -- the scene rendered pure
    // black start to finish. This is the same visual (a ring of mining
    // structures around the ship's flight path), built the way that reliably
    // works elsewhere in this catalogue.
    float theta = r1 * 6.2831853;
    float r = 80.0 + (r2 - 0.5) * 40.0;
    float zPos = (r3 - 0.5) * 400.0;

    vec3 centre = vec3(r * cos(theta), r * sin(theta) * 0.4, zPos);
    
    // Is this a base module or an asteroid?
    float isBase = step(0.85, r4);
    
    vec3 scale;
    mat3 rotMat;
    
    if (isBase > 0.5) {
        // Tech structures: sharp blocks, solar panels, hab modules
        float type = fract(r1 * 123.456);
        if (type < 0.3) {
            scale = vec3(2.0, 4.0, 2.0) * (1.0 + r2); // hab
        } else if (type < 0.6) {
            scale = vec3(8.0, 0.2, 4.0) * (1.0 + r2); // panel
        } else {
            scale = vec3(1.0, 8.0, 1.0) * (1.0 + r2); // spire
        }
        
        // Face inward, toward the flight path down the tunnel's axis.
        vec3 outward = normalize(vec3(cos(theta), sin(theta) * 0.4, 0.0));
        vec3 forward = -outward;
        vec3 up = vec3(0.0, 0.0, 1.0);
        vec3 right = cross(up, forward);
        rotMat = mat3(right, up, forward);
    } else {
        // Asteroids: irregular, tumbling
        scale = vec3(4.0, 4.0, 4.0) * (1.0 + r2 * 2.0);
        scale *= vec3(1.0, 0.6 + 0.8 * r1, 0.7 + 0.6 * r3);
        
        float a1 = time * (0.1 + r1 * 0.2) + r2 * 6.28;
        float a2 = time * (0.05 + r2 * 0.2) + r3 * 6.28;
        
        vec3 right = vec3(cos(a1), -sin(a1), 0.0);
        vec3 up = vec3(sin(a1), cos(a1), 0.0);
        vec3 forward = vec3(0.0, 0.0, 1.0);
        
        // simple rotation
        rotMat = mat3(
            cos(a2), 0.0, sin(a2),
            0.0, 1.0, 0.0,
            -sin(a2), 0.0, cos(a2)
        );
    }

    vec3 localPos = attrA.xyz * scale;
    vec3 world = centre + rotMat * localPos;
    
    // Camera flies straight along Z; wrap the tunnel so the slice near the
    // camera stays close to local origin -- the camZ/wrap/cull formula
    // TachyonCommRelay.vert uses for the same ring-around-a-travel-axis
    // shape.  NOTE: this scene still measures cover=0.0 in isolation even
    // with every placement/camera term stripped down to a fixed, trivially
    // on-screen grid AND the fragment output hard-set to unconditional
    // magenta -- neither shader stage is the cause, and no plausible
    // culprit (XML/geom matching, stale recordings, a duplicate source
    // file, a stale process) checked out either. Left in its best-effort,
    // structurally-correct state pending a RenderDoc-level trace this
    // environment cannot do; flagged for follow-up.
    float camZ = time * 8.0 + audioAdvance * 15.0;
    world.z = mod(world.z - camZ + 100.0, 200.0) - 100.0;

    if (world.z > 2.0 || world.z < -180.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    // Normal based on cube face
    vec3 nLocal = vec3(0.0);
    if(abs(attrA.x) > 0.49) nLocal = vec3(sign(attrA.x), 0.0, 0.0);
    else if(abs(attrA.y) > 0.49) nLocal = vec3(0.0, sign(attrA.y), 0.0);
    else nLocal = vec3(0.0, 0.0, sign(attrA.z));
    // (an earlier "simplified normal" attempt here compared a vec2 to a
    // scalar with `>`, which GLSL doesn't allow, and both of its ternary
    // branches returned the same value anyway -- dead code, removed)
    vec3 trueNormal = rotMat * nLocal;

    vCol = vec4(r1, r2, r3, isBase);
    vCorner = attrA.xyz;
    vPos = world;
    vNormal = trueNormal;
}
