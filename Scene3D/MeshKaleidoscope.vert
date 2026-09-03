#version 330 core
/**
 * @file MeshKaleidoscope.vert
 * @brief MESH KALEIDOSCOPE: a real loaded model between two tilted mirrors.
 * The model is drawn twelve times (instances="12"): every copy is turned
 * about the view axis by k * 30 degrees and every second copy is mirrored,
 * which is exactly the image set a two-mirror kaleidoscope makes of one
 * object.  The ring of copies turns slowly on the scene clock and the
 * object itself tumbles on time; the copies are sized from the model's own
 * bounding sphere so any asset fits.  The sky shell is drawn once
 * (collapsed on the other instances) and painted by the fragment stage.
 *
 * Audio here: none in the geometry (rule V7d) -- light and colour live in
 * the fragment stage.
 */
in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction.

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneAdvance;
uniform float sceneTime;
uniform int   meshVertexCount;
uniform int   meshInstances;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float ringP;     // radius of the ring of copies, in object radii
uniform float sizeP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;
out float vBg;
out float vCopy;

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    int  inst = gl_InstanceID;
    int  N    = max(meshInstances, 1);

    if (isBg)
    {
        if (inst > 0)
        {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vUV = vec2(0.0); vNormal = vec3(0.0, 1.0, 0.0); vPos = vec3(0.0); vBg = 1.0; vCopy = 0.0;
            return;
        }
        vec3 w = attrA.xyz;
        vNormal = normalize(attrB.xyz);
        vPos = w; vUV = vec2(0.0); vBg = 1.0; vCopy = 0.0;
        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }

    // The object, centred and sized by its bounding sphere.
    vec3 p = attrA.xyz - meshCenter;
    vec3 n = attrB.xyz;
    float rad = max(length(meshExtent), 1e-4);
    float size = 9.0 * (sizeP > 0.05 ? sizeP : 1.0) / rad;
    p *= size;

    // The object's own slow tumble (time, not the beat clock).
    float ry = time * 0.25, rx = 0.5 + 0.3 * sin(time * 0.05);
    mat3 RY = mat3(cos(ry), 0.0, -sin(ry), 0.0, 1.0, 0.0, sin(ry), 0.0, cos(ry));
    mat3 RX = mat3(1.0, 0.0, 0.0, 0.0, cos(rx), sin(rx), 0.0, -sin(rx), cos(rx));
    p = RY * RX * p;
    n = RY * RX * n;

    // Kaleidoscope: copy k is rotated by k * 2pi/N about the view axis and
    // mirrored on odd k (a reflection in the sector's mirror line).
    float k = float(inst);
    float mirror = (mod(k, 2.0) < 0.5) ? 1.0 : -1.0;
    p.x *= mirror; n.x *= mirror;
    float ring = (ringP > 0.05 ? ringP : 1.0) * 11.0;
    p += vec3(ring, 0.0, 0.0);                         // off-axis, so the copies form a wreath
    float ang = k * 6.2831853 / float(N) + sceneAdvance * 0.08 + sceneTime * 0.015;
    mat3 RZ = mat3(cos(ang), sin(ang), 0.0, -sin(ang), cos(ang), 0.0, 0.0, 0.0, 1.0);
    p = RZ * p;
    n = RZ * n;
    p.z += 42.0;

    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(n);
    vPos = p;
    vBg = 0.0;
    vCopy = k;

    vec3 vp = vec3(p.x - eyeOff, p.y, p.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
