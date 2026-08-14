#version 330 core
// GlassStack.vert — nested glass shells, and the first scene to sign the OIT
// contract.
// -----------------------------------------------------------------------
// Interpenetrating transparent boxes are precisely the case sorting cannot
// solve: there is no order of the objects that is correct for every pixel,
// because they pass through one another.  Sorting per triangle does not help
// either once two faces intersect.  Weighted-blended OIT sidesteps the question
// by never asking it.
//
// The scene is drawn twice.  With oitPass 0 it emits only its opaque parts
// (here: the core), with oitPass 1 only its transparent ones (the shells).
// -----------------------------------------------------------------------
in vec4 attrA;      // xyz = unit-cube corner, w = cube index
in vec4 attrB;      // per-cube hashes

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out float vShell;       // 0..1 across the stack, for colour
out float vKind;        // 0 = solid core, 1 = glass shell

uniform mat4  projM;
uniform float eyeOff;
uniform float oitPass;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioChroma[12];

uniform float camDistP;
uniform float spreadP;
uniform float shellsP;

const int SHELLS = 14;

vec3 rotAxis(vec3 v, vec3 axis, float a)
{
    float c = cos(a), s = sin(a);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

void main()
{
    float idx = attrA.w;
    int n = int(shellsP * float(SHELLS) + 0.5);
    n = clamp(n, 3, SHELLS);

    bool isCore = (idx < 0.5);
    // Only as many cubes as there are shells, plus the core.  The rest collapse.
    if (!isCore && idx > float(n))
    {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vObj = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0);
        vView = vec3(0.0, 0.0, 1.0); vShell = 0.0; vKind = 1.0;
        return;
    }

    // A pass only draws the half of the scene that belongs to it.  Emitting
    // both in both passes would double the core and let the glass write depth.
    bool wantSolid = (oitPass < 0.5);
    if (isCore != wantSolid)
    {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vObj = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0);
        vView = vec3(0.0, 0.0, 1.0); vShell = 0.0; vKind = 1.0;
        return;
    }

    vec3 c = attrA.xyz;
    float shell = isCore ? 0.0 : (idx - 1.0) / float(max(n - 1, 1));

    // Each shell is a box, scaled and tumbled on its own axis so the stack
    // interpenetrates instead of nesting neatly.  Neat nesting would be
    // sortable, and would prove nothing.
    float size = isCore ? 1.05
                        : (0.85 + spreadP * 2.3 * shell)
                          * (1.0 + 0.14 * audioChroma[int(shell * 11.0)] * 4.0);

    vec3 p = c * size;
    if (!isCore)
    {
        vec3 axis = normalize(vec3(0.4 + attrB.x, 0.3 + attrB.y, 0.2 + attrB.z));
        float a = audioAdvance * (0.10 + 0.05 * shell) + shell * 3.1;
        p = rotAxis(p, axis, a);
    }

    // Whole-stack tumble.
    float ya = audioAdvance * 0.09;
    mat3 yaw = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    vec3 pw = yaw * p;

    // Box normal from the corner's dominant axis, rotated the same way.
    vec3 an = abs(c);
    vec3 nrm = (an.x > an.y && an.x > an.z) ? vec3(sign(c.x), 0.0, 0.0)
             : (an.y > an.z)               ? vec3(0.0, sign(c.y), 0.0)
                                           : vec3(0.0, 0.0, sign(c.z));
    if (!isCore)
    {
        vec3 axis = normalize(vec3(0.4 + attrB.x, 0.3 + attrB.y, 0.2 + attrB.z));
        float a = audioAdvance * (0.10 + 0.05 * shell) + shell * 3.1;
        nrm = rotAxis(nrm, axis, a);
    }

    float dist = camDistP * (1.0 - 0.05 * audioLevel) * (1.0 - 0.03 * audioKick);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = yaw * nrm;
    vView   = normalize(-vp);
    vShell  = shell;
    vKind   = isCore ? 0.0 : 1.0;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
