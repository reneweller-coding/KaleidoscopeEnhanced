#version 330 core
/**
 * @file FleetJump.vert
 * @brief FLEET JUMP: a squadron of one craft (instances) charging a
 * hyperspace jump over the scene's arc.  Along sceneProgress the ships hold
 * formation and their drives spool up (light); in the last stretch of the
 * arc each hull STRETCHES along its own axis and streaks away ahead -- a
 * deformation of the objects, on a continuous ramp the drop regie can time
 * to the drop.  No hull hops, no formation twitch, no camera motion.
 *
 * Geometry: craft centred and normalised by the model's bounding sphere,
 * longest axis put on Z (nose toward -Z, i.e. toward the camera... no: the
 * fleet flies AWAY, so the nose points +Z).  Sky shell drawn once.
 */
in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneProgress;
uniform float sceneAdvance;
uniform int   meshVertexCount;
uniform int   meshInstances;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float sizeP;
uniform float spreadP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;
out float vBg;
out float vJump;
out float vAlong;

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    int inst = gl_InstanceID;
    int N = max(meshInstances, 1);

    if (isBg)
    {
        if (inst > 0)
        {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vUV = vec2(0.0); vNormal = vec3(0.0, 1.0, 0.0); vPos = vec3(0.0); vBg = 1.0; vJump = 0.0; vAlong = 0.0;
            return;
        }
        vec3 w = attrA.xyz;
        vNormal = normalize(attrB.xyz);
        vPos = w; vUV = vec2(0.0); vBg = 1.0; vJump = 0.0; vAlong = 0.0;
        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }

    // Craft in local space: centred, longest axis on Z, sized by the sphere.
    vec3 p = attrA.xyz - meshCenter;
    vec3 n = attrB.xyz;
    vec3 e = meshExtent;
    if (e.x >= e.y && e.x >= e.z)      { p = vec3(-p.z, p.y, p.x); n = vec3(-n.z, n.y, n.x); }
    else if (e.y >= e.x && e.y >= e.z) { p = vec3(p.x, -p.z, p.y); n = vec3(n.x, -n.z, n.y); }
    float rad = max(length(e), 1e-4);
    // Every craft its own size within the class: a squadron of identical
    // silhouettes at identical size is what reads as a lattice.
    float craft = 12.0 * (sizeP > 0.05 ? sizeP : 1.0) * (0.80 + 0.40 * hash11(float(gl_InstanceID) * 3.77));
    p *= craft / rad;
    vAlong = clamp(p.z / (craft * 0.6) * 0.5 + 0.5, 0.0, 1.0);   // 0 tail .. 1 nose

    // Formation: a wedge, ranks receding away from the camera.
    float fi = float(inst);
    float r = floor(sqrt(fi));
    float s = fi - r * r - r;
    float spr = (spreadP > 0.05 ? spreadP : 1.0);
    vec3 slot = vec3(s * craft * 1.6, (-abs(s) * 0.8 + r * 0.5) * craft * 0.12, r * craft * 1.3) * spr;
    // Off the lattice: a fixed random offset per craft, so the wedge is a
    // formation of ships and not a chart of them (reported).
    slot += (vec3(hash11(fi * 4.31), hash11(fi * 6.17), hash11(fi * 8.29)) - 0.5)
          * craft * vec3(1.30, 1.10, 2.20);
    // And every craft creeps ahead at its own rate over the arc, continuously,
    // so no two hold exactly the same speed before the jump.
    slot.z -= (0.2 + 0.8 * hash11(fi * 2.93)) * craft * 0.9 * clamp(sceneProgress, 0.0, 1.0);
    // A trace of station-keeping on time (feel, not motion).
    float ph = fi * 2.399963;
    slot += vec3(sin(time * 0.31 + ph), sin(time * 0.24 + ph * 1.3), sin(time * 0.37 + ph * 0.7)) * craft * 0.012;

    // The jump: over the last part of the arc each craft stretches along Z
    // and streaks ahead, staggered by rank so the wedge leaves in order.
    float prog = clamp(sceneProgress, 0.0, 1.0);
    // The jump starts past the middle of the arc and takes a quarter of it,
    // rank by rank; the drop regie bends the arc so the last rank leaves on
    // the drop.
    float cue = 0.5 + 0.06 * r + 0.05 * hash11(fi * 5.51);   // a little ragged
    float jump = smoothstep(cue, cue + 0.25, prog);
    vJump = jump;
    float stretch = 1.0 + 9.0 * jump * jump;
    p.z *= stretch;
    p.z += jump * jump * craft * 22.0;            // streaks away (stays inside the far plane)
    p.xy *= 1.0 - 0.5 * jump;                      // thins as it goes

    vec3 world = p + slot + vec3(0.0, -4.0, 70.0);
    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(n);
    vPos = world;
    vBg = 0.0;
    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
