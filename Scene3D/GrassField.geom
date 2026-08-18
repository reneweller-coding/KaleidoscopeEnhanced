#version 330 core
/**
 * @file GrassField.geom
 * @brief Geometry stage companion to GrassField.frag -- see that file's header for
 * this scene's description.
 */
// GrassField.geom — grow a blade of grass out of every point.
// -----------------------------------------------------------------------
// This is what a geometry shader is actually good for: the vertex buffer
// holds 60000 points and nothing else, and the GPU turns each of them into a
// tapered, wind-bent ribbon.  The blade shape lives entirely in this file —
// changing the grass costs no buffer rebuild and no CPU work at all.
//
// Two of the points are hijacked as the scene's backdrop: index 0 becomes the
// ground plane, index 1 a sky quad emitted straight in clip space.  Without
// them the gaps between blades would be pure black.
// -----------------------------------------------------------------------
layout(points) in;
layout(triangle_strip, max_vertices = 10) out;

in  vec3  gRoot[];
in  vec4  gRnd[];
in  float gIndex[];

out vec3  vWorld;
out vec3  vNormal;
out float vAlong;       // 0 at the root, 1 at the tip
out float vTint;        // per-blade colour jitter
out float vKind;        // 0 = sky, 1 = ground, 2 = blade

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioSubBass;
uniform float audioKick;
uniform float audioLevel;

uniform float camHP;        // preset: eye height
uniform float bladeP;       // preset: blade height
uniform float windP;        // preset: wind strength

const float FIELD_W = 26.0;
const float FIELD_D = 55.0;

// The engine's projection looks dead level, which shows the sward edge-on as a
// narrow band with the horizon across the middle.  Tilting the view down here
// — a rotation in view space, nothing the engine needs to know about — lifts
// the horizon into the upper third and lets the field open out into the frame.
const float PITCH = 0.30;

vec4 project(vec3 world)
{
    vec3 vp = vec3(world.x - eyeOff, world.y - (camHP + 1.7), world.z);
    float cs = cos(PITCH), sn = sin(PITCH);
    vp = vec3(vp.x, vp.y * cs + vp.z * sn, -vp.y * sn + vp.z * cs);
    vec4 c = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    c.x += eyeOff * 0.045 * c.w;
    return c;
}

void emit(vec3 world, vec3 n, float along, float tint, float kind)
{
    vWorld  = world;
    vNormal = n;
    vAlong  = along;
    vTint   = tint;
    vKind   = kind;
    gl_Position = project(world);
    EmitVertex();
}

void main()
{
    float idx = gIndex[0];

    // ---- backdrop -------------------------------------------------------
    if (idx < 0.5)
    {
        // Ground: one big quad under everything.  Wide and long enough that it
        // still fills the screen corners out at the horizon.
        vec3 n = vec3(0.0, 1.0, 0.0);
        const float G = 400.0;
        emit(vec3(-G, 0.0, -2.0), n, 0.0, 0.5, 1.0);
        emit(vec3( G, 0.0, -2.0), n, 0.0, 0.5, 1.0);
        emit(vec3(-G, 0.0,    G), n, 1.0, 0.5, 1.0);
        emit(vec3( G, 0.0,    G), n, 1.0, 0.5, 1.0);
        EndPrimitive();
        return;
    }
    if (idx < 1.5)
    {
        // Sky: written directly in clip space at the far plane, so the depth
        // test lets every blade and the ground draw in front of it.
        vKind = 0.0; vNormal = vec3(0.0, 0.0, 1.0); vTint = 0.5;
        vWorld = vec3(-1.0, -1.0, 0.0); vAlong = 0.0;
        gl_Position = vec4(-1.0, -1.0, 0.9999, 1.0); EmitVertex();
        vWorld = vec3( 1.0, -1.0, 0.0);
        gl_Position = vec4( 1.0, -1.0, 0.9999, 1.0); EmitVertex();
        vWorld = vec3(-1.0,  1.0, 0.0);
        gl_Position = vec4(-1.0,  1.0, 0.9999, 1.0); EmitVertex();
        vWorld = vec3( 1.0,  1.0, 0.0);
        gl_Position = vec4( 1.0,  1.0, 0.9999, 1.0); EmitVertex();
        EndPrimitive();
        return;
    }

    // ---- one blade ------------------------------------------------------
    vec3 root = gRoot[0];
    vec4 h    = gRnd[0];

    float height = bladeP * (0.55 + 0.85 * h.z);
    float width  = 0.020 + 0.016 * h.w;

    // Wind as a travelling wave across the field, plus a gust on the bass.
    // The phase comes from audioAdvance (host-integrated), never from
    // time x level — that product jitters the whole field on every beat.
    float gust  = windP * (0.55 + 0.5 * audioSubBass + 0.35 * audioKick);
    float phase = dot(root.xz, vec2(0.22, 0.31)) - audioAdvance * 1.6;
    float bend  = gust * (0.42 * sin(phase) + 0.18 * sin(phase * 2.7 + 1.3));
    bend += 0.10 * gust * sin(audioAdvance * 0.9 + h.x * 31.0);   // per-blade flutter

    // Each blade leans in its own direction, so a gust ripples rather than
    // sweeping the whole lawn like a single rigid sheet.
    float lean = 6.2831853 * h.y;
    vec2  dir  = vec2(cos(lean) * 0.35 + 0.94, sin(lean) * 0.35 + 0.34);
    dir = normalize(dir);

    // Quadratic Bezier: root, an upright control point, and a bent tip.
    vec3 p0 = root;
    vec3 p1 = root + vec3(0.0, height * 0.62, 0.0);
    vec3 p2 = root + vec3(dir.x * height * bend, height * (1.0 - 0.35 * bend * bend),
                          dir.y * height * bend);

    // The blade is widened across the screen, not across its own facing, so no
    // blade can turn exactly edge-on and vanish.  Its NORMAL still comes from
    // the per-blade lean, which is what gives the field its scattered
    // highlights instead of one uniform sheen.
    vec3 toEye = normalize(vec3(eyeOff, camHP, 0.0) - root);
    vec3 side  = normalize(cross(vec3(0.0, 1.0, 0.0), toEye));
    vec3 leanN = normalize(vec3(-dir.y, 0.55, dir.x));

    const int SEG = 4;
    for (int i = 0; i <= SEG; ++i)
    {
        float t = float(i) / float(SEG);
        vec3 a = mix(p0, p1, t);
        vec3 b = mix(p1, p2, t);
        vec3 p = mix(a, b, t);

        // Taper: the tip is a point, which is what keeps grass from reading as
        // a field of tiny rectangles.
        float w = width * (1.0 - t) * (1.0 - t * 0.45);

        vec3 tang = normalize(b - a);
        vec3 n = normalize(mix(leanN, cross(tang, side), 0.35));

        emit(p - side * w, n, t, h.w, 2.0);
        emit(p + side * w, n, t, h.w, 2.0);
    }
    EndPrimitive();
}
