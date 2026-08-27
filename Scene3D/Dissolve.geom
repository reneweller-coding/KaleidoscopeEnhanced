#version 330 core
/**
 * @file Dissolve.geom
 * @brief The model's own surface becomes the particle set: every triangle is
 * replaced by one camera-facing splat sitting at its centre. The object exhales
 * itself into a cloud and draws it back in.
 *
 * This is a different thing from ShatterSculpture and from Assembly. Those move
 * rigid CHUNKS -- pieces with edges, which stay recognisable as parts of the
 * object. Here the object becomes a continuum: no piece survives, only the
 * density does, and the silhouette persists as a shape made of dust rather than
 * as a broken solid.
 *
 * No compute shader and no particle buffer is involved. A 150k-triangle mesh
 * already IS a 150k-point set, evenly distributed over the surface by
 * construction, and the geometry stage can read it straight from the same VBO
 * every other mesh family draws. The particle count is therefore the model's
 * own triangle count, and it costs one extra primitive per triangle.
 *
 * Drift is a curl-like field built from cheap noise, so the cloud swirls
 * instead of expanding radially -- radial dispersal reads as an explosion, and
 * an explosion has a cause. This should read as breathing.
 */

layout(triangles) in;
layout(triangle_strip, max_vertices = 4) out;

in  vec3  gPos[];
in  vec3  gNormal[];
in  vec2  gUV[];
in  float gBg[];

out vec2  vUV;
out vec2  vQuad;      // -1..1 across the splat, for the round falloff
out vec3  vNormal;
out vec3  vPos;
out float vBg;
out float vLoose;     // 0 = home, 1 = fully dispersed

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioDrop;

uniform float sizeP;
uniform float looseP;    // how far the cloud travels
uniform float grainP;    // splat size

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

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

// Curl of a noise field, by finite differences. Divergence-free, so the cloud
// stirs and folds rather than inflating -- which is the whole difference
// between "breathing" and "exploding".
vec3 curl(vec3 p)
{
    const float e = 0.14;
    float x1 = noise3(p + vec3(0.0, e, 0.0)) - noise3(p - vec3(0.0, e, 0.0));
    float x2 = noise3(p + vec3(0.0, 0.0, e)) - noise3(p - vec3(0.0, 0.0, e));
    float y1 = noise3(p + vec3(0.0, 0.0, e)) - noise3(p - vec3(0.0, 0.0, e));
    float y2 = noise3(p + vec3(e, 0.0, 0.0)) - noise3(p - vec3(e, 0.0, 0.0));
    float z1 = noise3(p + vec3(e, 0.0, 0.0)) - noise3(p - vec3(e, 0.0, 0.0));
    float z2 = noise3(p + vec3(0.0, e, 0.0)) - noise3(p - vec3(0.0, e, 0.0));
    return normalize(vec3(x1 - x2, y1 - y2, z1 - z2) + vec3(1e-5));
}

void main()
{
    if( gBg[0] > 0.5 )
    {
        // The shell passes through as an ordinary triangle.
        for( int i = 0; i < 3; ++i )
        {
            vUV = gUV[i]; vQuad = vec2(0.0); vNormal = gNormal[i];
            vPos = gPos[i]; vBg = 1.0; vLoose = 0.0;
            vec3 vp = vec3(gPos[i].x - eyeOff, gPos[i].y, gPos[i].z);
            gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
            gl_Position.z = gl_Position.w * 0.999999;
            EmitVertex();
        }
        EndPrimitive();
        return;
    }

    float sz    = (sizeP > 0.01 ? sizeP : 1.0);
    float loose = (looseP > 0.01 ? looseP : 1.0);
    float grain = (grainP > 0.001 ? grainP : 1.0);
    float fit   = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);

    vec3 mid = (gPos[0] + gPos[1] + gPos[2]) / 3.0;
    vec3 nrm = normalize(gNormal[0] + gNormal[1] + gNormal[2] + vec3(1e-6));
    float id = dot(floor(mid * 512.0), vec3(1.0, 37.0, 991.0));

    // How far out the cloud is, driven by the music: it breathes with the
    // swell and blows out on a drop.
    float breathe = 0.5 - 0.5 * cos(time * 0.55 + audioAdvance * 0.20);
    float open = clamp(breathe * (0.35 + 0.75 * audioSwell)
                     + audioKick * 0.25 + audioDrop * 0.9, 0.0, 1.6);

    // Each particle keeps its own scale of travel, so the cloud has depth
    // instead of moving as one shell.
    float own = 0.35 + 1.15 * hash11(id * 1.37);
    vec3 flow = curl(mid * 3.1 + vec3(0.0, time * 0.10, 0.0));
    vec3 p = mid + flow * open * own * 0.42 * loose
                 + nrm * open * own * 0.10;

    vec3 world = (p - meshCenter) * (86.0 * sz * fit);
    world.z += 82.0;

    // A camera-facing quad. Building it in VIEW space keeps every splat square
    // on screen whatever direction it drifted, which a world-space quad cannot
    // do without a per-particle basis.
    float r = (0.35 + 0.9 * hash11(id * 3.71)) * grain * (1.0 + 0.9 * open) * 0.9;
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
        vLoose = clamp(open, 0.0, 1.0);
        gl_Position = projM * vec4(q.x, q.y, -q.z, 1.0);
        EmitVertex();
    }
    EndPrimitive();
}
