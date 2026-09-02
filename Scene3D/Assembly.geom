#version 330 core
/**
 * @file Assembly.geom
 * @brief The reverse of a shatter: the object arrives in pieces from far out
 * and assembles itself, timed so the last chunk seats near the end of the
 * scene's own screen time.
 *
 * The emotional shape is the opposite of ShatterSculpture's and that is the
 * point of having both. A shatter is a release -- everything happens at once
 * and then disperses. An assembly is an ANTICIPATION: for most of its length
 * the object is not there yet, and the eye spends the whole time working out
 * what it is going to be.
 *
 * Chunking follows ShatterSculpture's lesson exactly: fracture identity has to
 * be SPATIAL, not per-primitive. These meshes carry 150k triangles, so giving
 * each its own flight turns the object into a dust cloud with no silhouette.
 * The triangle's centre is quantised onto a grid and the whole cell flies as
 * one rigid slab.
 *
 * Chunks do NOT all arrive together. Each cell gets its own arrival time from
 * its hash, spread over the first half of the scene, so the object accretes
 * rather than snapping into place -- and finishes early enough to be seen
 * standing complete, which is the payoff the whole family builds toward.
 */

layout(triangles) in;
layout(triangle_strip, max_vertices = 3) out;

in  vec3  gPos[];
in  vec3  gNormal[];
in  vec2  gUV[];
in  float gBg[];

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out float vBg;
out float vSeat;     // 0 = still flying, 1 = seated; the frag stage glows the arrival
out float vLand;     // the landing flash: a short window BEFORE the seat, 0 once seated

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneProgress;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float audioAdvance;
uniform float audioKick;

uniform float sizeP;
uniform float chunkP;     // grid density: small = few big slabs, large = gravel
uniform float spreadP;    // how far out the pieces start

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec3  hash31(float n)
{
    return vec3(hash11(n), hash11(n + 17.3), hash11(n + 41.7));
}

void main()
{
    // The sky shell passes through untouched. Displacing it would take the
    // backdrop apart along with the object.
    if( gBg[0] > 0.5 )
    {
        for( int i = 0; i < 3; ++i )
        {
            vUV = gUV[i]; vNormal = gNormal[i]; vPos = gPos[i]; vBg = 1.0; vSeat = 1.0; vLand = 0.0;
            vec3 vp = vec3(gPos[i].x - eyeOff, gPos[i].y, gPos[i].z);
            gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
            gl_Position.z = gl_Position.w * 0.999999;   // pin the shell inside the far plane
            EmitVertex();
        }
        EndPrimitive();
        return;
    }

    float sz    = (sizeP > 0.01 ? sizeP : 1.0);
    // Cells per unit of OBJECT space. Assets are normalised to about 1.0 on
    // their longest axis, so a value of 5 gives roughly five cells across the
    // whole model -- slabs the size of a limb, which read as coloured
    // cardboard rather than as fragments. Useful range is 12..28.
    float chunk = (chunkP > 0.5 ? chunkP : 16.0);
    float spread= (spreadP > 0.01 ? spreadP : 1.0);
    float fit   = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);

    // Spatial chunk identity: quantise the triangle's centre onto a grid, hash
    // the CELL, and pivot on the cell's own centre so the slab rotates about
    // itself instead of about the origin.
    vec3 mid = (gPos[0] + gPos[1] + gPos[2]) / 3.0;
    vec3 cellIdx = floor(mid * chunk);
    vec3 cellMid = (cellIdx + 0.5) / chunk;
    float id = dot(cellIdx, vec3(1.0, 37.0, 991.0));

    // Arrivals spread over the first half, each taking 0.3 of the scene, so
    // the object is complete by about 0.8 and gets to be SEEN finished --
    // an assembly that is still landing when the scene cuts has no payoff.
    float t0 = hash11(id * 0.731) * 0.50;
    float k  = clamp((sceneProgress - t0) / 0.30, 0.0, 1.0);
    // Ease out hard: a piece decelerates into its seat rather than arriving at
    // full speed, which is what makes it look placed instead of thrown.
    float seat = 1.0 - pow(1.0 - k, 3.0);

    // The landing flash is defined on k, the flight's own clock, and it is
    // ZERO at k = 1 and stays zero.  The frag stage used to derive it from
    // seat as a "narrow window around seat = 1" whose closing edge lay at
    // 1.02 -- a value the clamped seat never reaches -- so the flash never
    // ended and every finished object stood as a flat orange silhouette
    // (measured RGB 0.67 / 0.36 / 0.17, no shading at all).
    float land = smoothstep(0.85, 0.97, k) * (1.0 - smoothstep(0.97, 1.0, k));

    vec3 dir = normalize(hash31(id) * 2.0 - 1.0 + vec3(0.0, 0.0001, 0.0));
    float dist = (18.0 + 46.0 * hash11(id * 2.17)) * spread;
    vec3 offset = dir * dist * (1.0 - seat);

    // Tumbling that stops exactly when the piece seats, so nothing is left
    // rotating inside the finished object.
    float ang = (1.0 - seat) * (5.5 + 9.0 * hash11(id * 5.11))
              + (1.0 - seat) * audioAdvance * 0.25;
    vec3 ax = normalize(hash31(id + 3.3) * 2.0 - 1.0 + vec3(0.0001));
    float c = cos(ang), s = sin(ang), ic = 1.0 - c;
    mat3 spin = mat3(
        c + ax.x*ax.x*ic,        ax.x*ax.y*ic + ax.z*s,  ax.x*ax.z*ic - ax.y*s,
        ax.y*ax.x*ic - ax.z*s,   c + ax.y*ax.y*ic,       ax.y*ax.z*ic + ax.x*s,
        ax.z*ax.x*ic + ax.y*s,   ax.z*ax.y*ic - ax.x*s,  c + ax.z*ax.z*ic);

    // A seated piece jolts on the beat -- the object is assembled but still
    // being struck, so it never goes completely still.
    vec3 jolt = dir * audioKick * 0.012 * seat;

    for( int i = 0; i < 3; ++i )
    {
        vec3 p = cellMid + spin * (gPos[i] - cellMid) + offset + jolt;
        vec3 world = (p - meshCenter) * (78.0 * sz * fit);
        world.z += 78.0;

        vUV = gUV[i];
        vNormal = normalize(spin * gNormal[i]);
        vPos = world;
        vBg = 0.0;
        vSeat = seat;
        vLand = land;

        vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        EmitVertex();
    }
    EndPrimitive();
}
