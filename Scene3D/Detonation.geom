#version 330 core
// Detonation.geom — break a shell into its own triangles and blow them apart.
// -----------------------------------------------------------------------
// The vertex buffer is an ordinary closed mesh.  Only a geometry shader can
// take a triangle and treat it as an INDEPENDENT rigid body, because only here
// do all three corners of a face arrive together — a vertex shader sees one
// corner at a time and has no idea which face it belongs to, so it can never
// move a whole shard as a unit.
//
// The blast is not uniform: a ring of pressure sweeps out from a wandering
// epicentre across the surface of the sphere, so shards lift in a travelling
// wave and settle back behind it, instead of the whole shell pulsing at once.
// -----------------------------------------------------------------------
layout(triangles) in;
layout(triangle_strip, max_vertices = 3) out;

in  vec3 gObj[];
in  vec4 gRnd[];
in  vec2 gUV[];

out vec3  vNormal;
out vec3  vView;
out float vShard;      // how far this shard has flown, 0..1
out float vEdge;       // per-shard random, for colour scatter
out vec2  vUV;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioLevel;
uniform float audioHigh;

uniform float blastP;       // preset: how far the shards fly
uniform float camDistP;     // preset: distance to the shell
uniform float spinP;        // preset: shard tumble

const float PI = 3.14159265;

// The mesh's own triangles are far too fine to be shards — 52800 of them on a
// unit sphere, each about a hundredth across.  Flung individually they read as
// dust, not as a breaking shell.  So the shards are PLATES: a coarse grid laid
// over the surface, with every triangle inside a plate sharing one centre, one
// axis and one throw, which makes them fly as a single rigid chip.
const float PLATE_W = 28.0;
const float PLATE_H = 15.0;

// Rotate v around a unit axis by angle a (Rodrigues).
vec3 rotAxis(vec3 v, vec3 axis, float a)
{
    float c = cos(a), s = sin(a);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

float hash1(vec2 p)
{
    return fract(sin(dot(p, vec2(41.317, 289.113))) * 43758.5453);
}

void main()
{
    vec3 a = gObj[0], b = gObj[1], c = gObj[2];

    // Which plate does this triangle belong to, and where is that plate's
    // centre on the sphere?
    vec2 uvC  = (gUV[0] + gUV[1] + gUV[2]) / 3.0;
    vec2 cell = floor(uvC * vec2(PLATE_W, PLATE_H));
    vec2 cuv  = (cell + 0.5) / vec2(PLATE_W, PLATE_H);
    float cth = cuv.x * 2.0 * PI, cphi = cuv.y * PI;
    vec3 centre = vec3(sin(cphi) * cos(cth), cos(cphi), sin(cphi) * sin(cth));

    vec3 dir = normalize(centre);
    vec4 h = vec4(hash1(cell), hash1(cell + 7.31),
                  hash1(cell + 19.7), hash1(cell + 43.2));
    float tw = h.w;

    // Travelling shock ring: angular distance from a slowly wandering
    // epicentre, compared against a radius that expands, wraps and expands
    // again.  The phase comes from audioAdvance so the ring's speed never
    // jumps when the level does.
    float ea = audioAdvance * 0.23;
    vec3 epi = normalize(vec3(cos(ea), 0.55 * sin(ea * 0.7), sin(ea)));
    float ang = acos(clamp(dot(dir, epi), -1.0, 1.0));       // 0 .. PI
    float ringR = fract(audioAdvance * 0.20) * (PI + 0.9) - 0.45;
    float ring = exp(-pow((ang - ringR) / 0.30, 2.0));

    // Loudness lifts the whole shell a little; the kick drives the ring.  The
    // resting term stays small on purpose — a shell that is always half open
    // has nothing left to do when the kick lands.
    float drive = blastP * (0.035 + 0.10 * audioSubBass
                                  + 0.85 * audioKick * ring
                                  + 0.30 * ring * audioLevel);
    float fly = drive * (0.55 + 0.9 * h.x + 0.5 * tw);

    // Plates shrink toward their own centre as they leave, so the cracks open
    // instead of the shell just inflating.
    float shrink = 1.0 - clamp(fly * 0.9, 0.0, 0.24);

    // Tumble, around each shard's own random axis.
    vec3 axis = normalize(vec3(h.y - 0.5, h.z - 0.5, h.w - 0.5) + 0.001);
    float spin = spinP * fly * (0.9 + 1.6 * tw);

    // A shard's own outward push plus a little sideways scatter.
    vec3 scatter = normalize(cross(dir, axis)) * fly * 0.35 * (tw - 0.5) * 2.0;

    // A little resting height jitter, so the closed shell reads as crust rather
    // than as a perfectly machined tiling.
    vec3 offset = dir * (fly + (h.z - 0.5) * 0.045) + scatter;

    // Slow tumble of the whole shell.
    float ya = audioAdvance * 0.13;
    float pa = 0.30 * sin(audioAdvance * 0.09);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    // The face normal is FLAT per shard — that is what makes each one read as a
    // solid chip of shell rather than as part of a smooth ball.
    vec3 fn = normalize(cross(b - a, c - a));
    if (dot(fn, dir) < 0.0) fn = -fn;
    fn = rot * rotAxis(fn, axis, spin);

    float dist = camDistP * (1.0 - 0.04 * audioLevel);
    vec3 corner[3] = vec3[3](a, b, c);

    for (int i = 0; i < 3; ++i)
    {
        vec3 p = centre + (corner[i] - centre) * shrink;
        p = rotAxis(p - centre, axis, spin) + centre + offset;
        p = rot * p;

        vec3 vp = vec3(p.x - eyeOff, p.y, p.z + dist);

        vNormal = fn;
        vView   = normalize(-vp);
        vShard  = clamp(fly * 1.6, 0.0, 1.0);
        vEdge   = h.x;
        vUV     = gUV[i];

        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        EmitVertex();
    }
    EndPrimitive();
}
