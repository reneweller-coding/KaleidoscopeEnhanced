#version 330 core
/**
 * @file MeshTerrain.vert
 * @brief Vertex stage for MeshTerrain.frag: the model is not an object here,
 * it is the LANDSCAPE. Scaled up by two orders of magnitude, laid flat and
 * flown over.
 *
 * Nothing about the asset changes; only the relationship between it and the
 * camera does. A sculpture's folds become ridges and valleys once they are
 * kilometres across and lit from the side, and the eye has no way to tell that
 * the mountain range it is crossing used to be a bust on a plinth. That is the
 * whole trick, and it costs one transform.
 *
 * The flight is along +Z and WRAPS: the terrain is repeated by shifting the
 * model by its own depth, so the flight never ends and never jumps.
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
uniform float sceneProgress;   // 0 at activation -> 1 at the end of the solo span
uniform float audioSwell;

uniform float sizeP;      // how large the landscape is
uniform float speedP;     // flight speed
uniform float heightP;    // relief exaggeration

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out float vDist;          // distance ahead, for the haze
out float vBg;

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;

    if( !isBg )
    {
        float sz  = (sizeP > 0.01 ? sizeP : 1.0);
        float spd = (speedP > 0.01 ? speedP : 1.0);
        float hgt = (heightP > 0.01 ? heightP : 1.0);

        vec3 p = attrA.xyz - meshCenter;
        vec3 nrm = normalize(attrB.xyz);

        // Lay the model's LONGEST axis along the flight direction, whichever
        // axis that happens to be, so every asset gives a long run of terrain
        // instead of a wall to fly into.
        vec3 e = meshExtent;
        if( e.x >= e.y && e.x >= e.z )      { p = vec3(p.z, p.y, p.x);  nrm = vec3(nrm.z, nrm.y, nrm.x);  e = vec3(e.z, e.y, e.x); }
        else if( e.y >= e.x && e.y >= e.z ) { p = vec3(p.x, p.z, p.y);  nrm = vec3(nrm.x, nrm.z, nrm.y);  e = vec3(e.x, e.z, e.y); }

        // Flatten: relief is a fraction of the ground scale, or the
        // "landscape" is a wall. Real terrain is far wider than it is tall.
        //
        // Every one of these numbers is bounded by kSceneFar (220): the first
        // version laid out 620-unit ground and pushed it to z+130, so most of
        // the terrain sat behind the camera and the rest was beyond the far
        // plane. What survived was a sliver, and the haze finished it off --
        // the render was a coloured fog with a sun in it. The visible span is
        // now deliberately 12..212.
        float groundX = 195.0 * sz;      // across the frame
        float groundZ = 300.0 * sz;      // half-length along the flight
        float relief  = 36.0 * sz * hgt;
        vec3 q = vec3(p.x / max(e.x, 1e-4) * groundX,
                      p.y / max(e.y, 1e-4) * relief,
                      p.z / max(e.z, 1e-4) * groundZ);

        // ONE crossing per scene, not a wrap. Wrapping the coordinate with
        // mod() tore the mesh: any triangle straddling the seam had its
        // vertices sent to opposite ends of the world and stretched across the
        // whole span, which littered the ground with pale shards. There is no
        // per-triangle information in a vertex shader to fix that with, so the
        // seam has to not exist. The terrain is laid out long and crosses the
        // view once over the scene's own screen time -- which also gives the
        // family an arc instead of an endless loop.
        // Bounded so the visible window (z = 12..212, inside kSceneFar) is
        // covered for the WHOLE crossing: the near edge never rises above 12
        // and the far edge never falls below 212. Solving both gives travel in
        // [-groundZ, groundZ-200], which needs groundZ > 100 to be a range at
        // all -- hence 300.
        float travel = mix(-groundZ, groundZ - 200.0, clamp(sceneProgress, 0.0, 1.0))
                     + audioAdvance * 1.2 * spd;
        q.z -= travel;

        // Low and close. At 26 units up the ridges collapsed into a band along
        // the bottom of the frame -- a map, not a flight. Skimming them puts the
        // horizon high and lets the near ground fill the shot.
        q.y -= relief * 0.30 + 9.0;
        world = q;
        world.z += 12.0;                  // 12 .. 212, inside kSceneFar

        // The non-uniform squash changes the normals too: a normal transforms
        // by the INVERSE TRANSPOSE, which for a pure scale means dividing by
        // each factor instead of multiplying. Getting this backwards would
        // light the flattened terrain as though it were still a round object.
        n = normalize(vec3(nrm.x * max(e.x, 1e-4) / groundX,
                           nrm.y * max(e.y, 1e-4) / relief,
                           nrm.z * max(e.z, 1e-4) / groundZ));
        vUV = vec2(attrA.w, attrB.w);
        vDist = world.z;
        vBg = 0.0;
    }
    else
    {
        world = attrA.xyz;
        n = normalize(attrB.xyz);
        vUV = vec2(0.0);
        vDist = 1e6;
        vBg = 1.0;
    }

    vNormal = n;
    vPos = world;

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    if( isBg ) gl_Position.z = gl_Position.w * 0.999999;
}
