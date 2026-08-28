#version 330 core
/**
 * @file Condensation.geom
 * @brief A cloud that resolves into an object. Each triangle contributes one
 * large, soft puff of gas; over the scene's own screen time the puffs migrate
 * from a formless volume onto the surface they belong to, and the shape
 * emerges out of the fog.
 *
 * The staging is the point and it is the reverse of Dissolve's. Dissolve
 * breathes: it starts as the object and keeps returning to it. This one starts
 * as NOTHING recognisable and answers a question the viewer has been holding
 * for most of the scene -- so the whole family is built around sceneProgress,
 * not around a periodic function.
 *
 * A real volume needs blending, and the mesh path draws with blending disabled
 * (RenderPipeline sets opaque state for GEOM_MESH). The fragment stage gets
 * density another way, by discarding stochastically: where many puffs overlap,
 * more fragments survive, and the accumulation IS the density. Same principle
 * the Hologram family uses for see-through, applied to a volume instead of a
 * surface.
 */

layout(triangles) in;
layout(triangle_strip, max_vertices = 4) out;

in  vec3  gPos[];
in  vec3  gNormal[];
in  vec2  gUV[];
in  float gBg[];

out vec2  vUV;
out vec2  vQuad;
out vec3  vNormal;
out vec3  vPos;
out float vBg;
out float vFormed;    // 0 = still gas, 1 = arrived on the surface

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneProgress;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float sizeP;
uniform float cloudP;    // how large the initial cloud is
uniform float puffP;     // puff size

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec3  hash31(float n) { return vec3(hash11(n), hash11(n + 17.3), hash11(n + 41.7)); }

float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(mix(mix(hash11(n), hash11(n + 1.0), f.x),
                   mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
               mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
                   mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

void main()
{
    if( gBg[0] > 0.5 )
    {
        for( int i = 0; i < 3; ++i )
        {
            vUV = gUV[i]; vQuad = vec2(0.0); vNormal = gNormal[i];
            vPos = gPos[i]; vBg = 1.0; vFormed = 1.0;
            vec3 vp = vec3(gPos[i].x - eyeOff, gPos[i].y, gPos[i].z);
            gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
            gl_Position.z = gl_Position.w * 0.999999;
            EmitVertex();
        }
        EndPrimitive();
        return;
    }

    float sz    = (sizeP > 0.01 ? sizeP : 1.0);
    float cloud = (cloudP > 0.01 ? cloudP : 1.0);
    float puff  = (puffP > 0.001 ? puffP : 1.0);
    float fit   = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);

    vec3 mid = (gPos[0] + gPos[1] + gPos[2]) / 3.0;
    vec3 nrm = normalize(gNormal[0] + gNormal[1] + gNormal[2] + vec3(1e-6));
    float id = dot(floor(mid * 512.0), vec3(1.0, 37.0, 991.0));

    // Each puff resolves on its own schedule, but the LAST one has to land well
    // before the scene ends. Spreading starts over 0.55 and giving each 0.40 to
    // travel meant the object was only complete at 95% of the solo span -- and
    // a scene rarely gets its whole span, so in practice it never resolved at
    // all. Measured: formed peaked at 0.11 and fell back. Complete by 0.65 now,
    // which also leaves the last third to simply BE the object, which is the
    // payoff the whole family builds toward.
    float t0 = hash11(id * 0.417) * 0.28;
    float k = clamp((sceneProgress - t0) / 0.26, 0.0, 1.0);
    float formed = k * k * (3.0 - 2.0 * k);        // smoothstep, no derivative jump

    // Where the puff waits: a large, slowly stirring volume, NOT a sphere. A
    // sphere would announce its own centre and the eye would read a ball long
    // before it read the object.
    vec3 wander = hash31(id) * 2.0 - 1.0;
    vec3 drift = vec3(noise3(mid * 2.0 + vec3(time * 0.06, 0.0, 0.0)) - 0.5,
                      noise3(mid * 2.0 + vec3(0.0, time * 0.05, 11.0)) - 0.5,
                      noise3(mid * 2.0 + vec3(7.0, 0.0, time * 0.07)) - 0.5);
    // The waiting volume, in MODEL units (the model spans about +-0.5), so
    // 0.9 + 1.6 put the gas five times the object's own size away and it
    // never read as belonging to anything.
    // Halved again. At 0.40 + 0.70 the cloud was over three times the object's
    // own size, and the journey home was long enough that the shape only
    // appeared at the very end -- proven by running the same scene with the
    // spread set to nothing, which made the object render immediately and
    // correctly. The target was never wrong; the distance was.
    vec3 gasPos = mid + (wander * 0.20 + drift * 0.32) * cloud;

    vec3 p = mix(gasPos, mid, formed);

    // Even once formed, the surface keeps a little breath on the beat, so the
    // object never sets into something inert.
    p += nrm * audioKick * 0.02 * formed;

    vec3 world = (p - meshCenter) * (88.0 * sz * fit);
    world.z += 84.0;

    // Puffs shrink as they resolve: gas is made of larger, softer blobs and a
    // surface of small tight ones, so a constant size would leave the finished
    // object looking furry.
    //
    // Splat radius, in WORLD units. A mesh contributes one splat per
    // triangle -- about 100k of them -- so the radius has to be set
    // against that count, not by eye: for the cloud to read as a cloud
    // its total splat area should be a small multiple of the object's
    // own screen area, which for a ~44-unit object and 100k splats puts
    // the radius near 0.15. The first version used 2..6 and the result
    // was a wall of fog covering 100% of the frame with no object in it.
    // Sized by MEASUREMENT, not by eye, in both directions: 2..6 covered 100% of
    // the frame with a wall of fog, and the first correction to 0.3..0.9 left
    // only 1..10% and no cloud to speak of. These give a gas dense enough to
    // read as volume and a surface dense enough to read as solid.
    float r = (0.13 + 0.26 * hash11(id * 2.13)) * puff * mix(5.0, 2.2, formed);
    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);

    vec2 corner[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
    for( int i = 0; i < 4; ++i )
    {
        vec3 q = vp + vec3(corner[i].x * r, corner[i].y * r, 0.0);
        vUV = gUV[0];
        vQuad = corner[i];
        vNormal = nrm;
        vPos = vec3(q.x + eyeOff, q.y, q.z);
        vBg = 0.0;
        vFormed = formed;
        gl_Position = projM * vec4(q.x, q.y, -q.z, 1.0);
        EmitVertex();
    }
    EndPrimitive();
}
