#version 330 core
// HairCurtain.geom — hang a strand of hair from every point.
// -----------------------------------------------------------------------
// Same trick as GrassField — 60000 bare points become 60000 ribbons on the
// GPU — but the physics and the shading are the opposite problem.  A blade of
// grass is a stiff cantilever bending against gravity; a hair is limp, so its
// shape is a travelling wave that loses amplitude toward the root, not toward
// the tip.
//
// What the fragment shader needs from here is the TANGENT, not a normal: hair
// is a cylinder too thin to resolve, and its highlight is the ring of
// directions perpendicular to the fibre rather than a point.  That is why the
// strand carries its own direction down the pipeline.
// -----------------------------------------------------------------------
layout(points) in;
layout(triangle_strip, max_vertices = 18) out;

in  vec3  gRoot[];
in  vec3  gLean[];
in  vec4  gRnd[];
in  float gIndex[];

out vec3  vWorld;
out vec3  vTangent;
out float vAlong;       // 0 at the root, 1 at the tip
out float vTint;
out float vKind;        // 0 = backdrop, 1 = strand

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float time;
uniform float audioSubBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioHigh;

uniform float lengthP;      // preset: strand length
uniform float swayP;        // preset: how far the wave throws them
uniform float camHP;

const int SEG = 8;

vec4 project(vec3 world)
{
    vec3 vp = vec3(world.x - eyeOff, world.y - camHP, world.z);
    vec4 c = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    c.x += eyeOff * 0.045 * c.w;
    return c;
}

void emit(vec3 world, vec3 tang, float along, float tint, float kind)
{
    vWorld = world; vTangent = tang; vAlong = along; vTint = tint; vKind = kind;
    gl_Position = project(world);
    EmitVertex();
}

void main()
{
    // Point 0 is spent on a backdrop quad at the far plane; without it the gaps
    // between strands are pure black and the curtain has no depth.
    if (gIndex[0] < 0.5)
    {
        vKind = 0.0; vTangent = vec3(0.0, 1.0, 0.0); vTint = 0.5; vAlong = 0.0;
        vWorld = vec3(-1.0, -1.0, 0.0);
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

    vec3 root = gRoot[0];
    vec4 h = gRnd[0];

    float len   = lengthP * (5.2 + 1.6 * h.z);
    float width = 0.005 + 0.006 * h.w;

    // The wave runs across the curtain and DOWN each strand.  Amplitude grows
    // with distance from the root, because that is what being limp means.
    float amp   = swayP * (0.35 + 0.55 * audioSubBass + 0.45 * audioKick);
    float phase = root.x * 0.55 + root.z * 0.3 - time * 0.8 - audioAdvance * 1.35;

    vec3 prev = root;
    for (int i = 0; i <= SEG; ++i)
    {
        float t = float(i) / float(SEG);

        // The strand leaves its root along the crown's normal and straightens
        // into a fall — hair keeps the shape of what it lay on for the first
        // stretch, then gravity takes over.
        vec3 path = mix(gLean[0], vec3(0.0, -1.0, 0.0), smoothstep(0.0, 0.45, t));

        // Two modes: a slow body swing and a faster shimmer near the tips.
        float s = amp * t * t;
        vec3 p = root + path * len * t;
        p.x += s * (0.9 * sin(phase + t * 3.4) + 0.3 * sin(phase * 2.3 + t * 7.1));
        p.z += s * 0.45 * sin(phase * 0.8 + t * 2.6 + h.x * 6.28);
        p.x += 0.06 * t * t * sin(audioAdvance * 3.1 + h.y * 40.0) * (0.3 + audioHigh);

        vec3 tang = (i == 0) ? vec3(0.0, -1.0, 0.0) : normalize(p - prev);
        prev = p;

        // Widen across the SCREEN, so a strand can never turn edge-on and drop
        // out; the tangent carries the real fibre direction for the shading.
        vec3 toEye = normalize(vec3(eyeOff, camHP, 0.0) - p);
        vec3 side = normalize(cross(tang, toEye));

        float w = width * (1.0 - 0.55 * t);
        emit(p - side * w, tang, t, h.w, 1.0);
        emit(p + side * w, tang, t, h.w, 1.0);
    }
    EndPrimitive();
}
