#version 330 core
/**
 * @file ShatterSculpture.geom
 * @brief Geometry stage companion to ShatterSculpture.frag -- see that file's
 * header for this scene's description.
 */
// ShatterSculpture.geom -- blow the statue apart into its own triangles.
// -----------------------------------------------------------------------
// Every shard has to move as a RIGID piece: all three of its corners share
// one translation and one rotation about one pivot, or the triangle shears
// and the whole thing reads as melting rather than breaking. That pivot is
// the triangle's centre point (shardMid below -- it cannot be called
// `centroid`, which GLSL reserves as an interpolation qualifier), and no
// vertex knows it on its own: a vertex is shared between triangles, so "my
// triangle's centre" is not a vertex property. It only exists once all
// three corners are in view, which is why this is a geometry stage and
// ShatterSculpture.vert is a pass-through.
//
// gl_PrimitiveIDIn gives each shard a stable identity, so its direction,
// spin axis and rate are hashed once and stay put -- the same shard flies
// the same way every cycle instead of shimmering.
//
// The mesh's own vertices are followed in the same buffer by the enclosing
// sky shell (see Scene3DShader::buildGeometry()); gBg marks those, and they
// pass through untouched -- shattering the backdrop would tear the sky open.
// -----------------------------------------------------------------------
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
out float vShard;    // 0 = seated in the statue, 1 = fully flown out; the frag stage glows the fracture

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;

uniform float sizeP;
uniform float burstP;
uniform float spinP;
uniform float chunkP;   // fracture grid resolution: SMALL = few big slabs, LARGE = fine gravel

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

vec3 hashDir(float n)
{
    // Two independent hashes -> a point on the sphere. Straight per-axis
    // hashing biases toward the cube's corners, which makes the burst look
    // like it prefers eight diagonal directions.
    float u = hash11(n * 1.7) * 2.0 - 1.0;
    float a = hash11(n * 3.1 + 5.0) * 6.2831853;
    float r = sqrt(max(0.0, 1.0 - u * u));
    return vec3(r * cos(a), u, r * sin(a));
}

mat3 axisRot(vec3 ax, float ang)
{
    float c = cos(ang), s = sin(ang), t = 1.0 - c;
    return mat3(t*ax.x*ax.x + c,      t*ax.x*ax.y + s*ax.z, t*ax.x*ax.z - s*ax.y,
                t*ax.x*ax.y - s*ax.z, t*ax.y*ax.y + c,      t*ax.y*ax.z + s*ax.x,
                t*ax.x*ax.z + s*ax.y, t*ax.y*ax.z - s*ax.x, t*ax.z*ax.z + c);
}

void main()
{
    // The sky shell: emit verbatim, no shatter, no statue transform.
    if (gBg[0] > 0.5)
    {
        for (int i = 0; i < 3; ++i)
        {
            vec3 w = gPos[i];
            vUV = vec2(0.0); vNormal = gNormal[i]; vPos = w; vBg = 1.0; vShard = 0.0;
            vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
            gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
            gl_Position.x += eyeOff * 0.045 * gl_Position.w;
            // Pin the shell just inside the far plane -- its cube corners
            // otherwise reach sqrt(3) * kSkyShellRadius and get clipped,
            // punching wedges out of the sky. Also guarantees the shell can
            // never occlude a shard that has flown out past it.
            gl_Position.z = gl_Position.w * 0.999999;
            EmitVertex();
        }
        EndPrimitive();
        return;
    }

    float sz = (sizeP > 0.01 ? sizeP : 1.0);
    float bp = (burstP > 0.01 ? burstP : 1.0);
    float sp = (spinP > 0.01 ? spinP : 1.0);

    // Burst envelope. audioAdvance is the host-integrated musical phase, so
    // this breathes with the tempo and -- crucially -- is CONTINUOUS: a
    // shatter driven straight off the kick transient would snap open and
    // shut every beat, which is both ugly and well past the catalogue's
    // temporal budget for full-object motion. The kick only adds a nudge on
    // top of a curve that is already moving smoothly.
    float cycle = 0.5 - 0.5 * cos(audioAdvance * 0.42);
    // Bias the cycle hard toward its low end. A plain cosine spends half its
    // time open, which turned the piece into a permanent cloud of debris --
    // the statue standing INTACT is half the effect, so it has to be the
    // resting state, with the burst reading as a brief event.
    cycle = pow(cycle, 2.6);
    float burst = clamp(cycle * 0.9 + audioKick * 0.16, 0.0, 1.1) * bp;
    burst = smoothstep(0.04, 1.0, burst);

    vec3 shardMid = (gPos[0] + gPos[1] + gPos[2]) / 3.0;

    // FRACTURE INTO CHUNKS, not into triangles. These meshes carry ~20k
    // triangles, so each one is tiny -- giving every triangle its own motion
    // (the obvious reading of "shatter") turns the piece into a uniform
    // powder cloud the moment it opens, and the silhouette is gone. Real
    // fracture produces a limited number of solid pieces, so the identity
    // that drives the motion has to be SPATIAL: quantise the triangle's
    // centre onto a grid, and every triangle in that cell shares one
    // direction, one spin and one pivot -- so they fly as one rigid slab.
    float chunk = (chunkP > 0.5 ? chunkP : 4.5);
    vec3 cellIdx = floor(shardMid * chunk);
    vec3 cellMid = (cellIdx + 0.5) / chunk;
    float id = dot(cellIdx, vec3(1.0, 37.0, 991.0));

    // Chunks further from the statue's axis leave earlier and travel
    // further, so the burst peels outward instead of every piece leaving at
    // once.
    float rad = clamp(length(cellMid.xz) * 2.0, 0.0, 1.0);
    float lead = mix(0.55, 1.35, hash11(id * 0.37)) * mix(0.7, 1.3, rad);
    float travel = burst * lead;

    // Outward-biased direction: mostly away from the centre (so it reads as
    // an explosion from within), partly hashed (so it isn't a clean sphere).
    vec3 outward = normalize(cellMid + vec3(0.0, 0.02, 0.0) + 1e-5);
    vec3 dir = normalize(mix(hashDir(id), outward, 0.55));

    // 0.30 of the model's own size at full burst: far enough that the piece
    // clearly comes apart, close enough that the silhouette is still
    // readable as the original statue rather than a uniform debris ball.
    vec3 offset = dir * travel * 0.30;
    offset.y += travel * travel * -0.07;          // a little fall, so it isn't weightless

    mat3 shardSpin = axisRot(normalize(hashDir(id + 91.0) + 1e-5),
                             travel * (1.6 + 2.4 * hash11(id * 0.77)) * sp);

    // The statue's own slow display rotation, applied after the shatter so
    // shards keep flying relative to the piece rather than being dragged
    // sideways by it.
    float rotY = time * 0.10 + audioAdvance * 0.05;
    float cy = cos(rotY), sy = sin(rotY);
    mat3 disp = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);

    for (int i = 0; i < 3; ++i)
    {
        // Pivot on the CHUNK's centre, not the triangle's -- rotating each
        // triangle about its own centre would shear the chunk apart again
        // and undo the grouping.
        vec3 p = cellMid + shardSpin * (gPos[i] - cellMid) + offset;
        vec3 w = disp * (p * (30.0 * sz));
        w.z += 82.0;

        vUV     = gUV[i];
        vNormal = normalize(disp * shardSpin * gNormal[i]);
        vPos    = w;
        vBg     = 0.0;
        vShard  = clamp(travel, 0.0, 1.0);

        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        EmitVertex();
    }
    EndPrimitive();
}
