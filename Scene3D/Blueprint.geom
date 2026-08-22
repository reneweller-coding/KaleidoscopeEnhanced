#version 330 core
/**
 * @file Blueprint.geom
 * @brief Geometry stage companion to Blueprint.frag -- see that file's header for
 * this scene's description.
 */
// Blueprint.geom — hand every triangle its own barycentric coordinates.
// -----------------------------------------------------------------------
// Drawing a mesh as a wireframe normally means a second pass in GL_LINES, with
// its own draw call, its own z-fighting against the filled surface, and line
// widths the core profile no longer guarantees.  The single-pass trick needs
// one thing a vertex shader cannot provide: each vertex must know WHICH corner
// of its triangle it is.  A vertex is shared between triangles, so that is not
// a property of the vertex — it only exists once the whole triangle is in view,
// which is exactly what the geometry stage gets.
//
// With (1,0,0), (0,1,0), (0,0,1) at the corners, the interpolated value is the
// barycentric coordinate, and its smallest component is the distance to the
// nearest edge.  The fragment shader draws a line where that distance is small.
// -----------------------------------------------------------------------
layout(triangles) in;
layout(triangle_strip, max_vertices = 3) out;

in  vec3  gObj[];
in  vec2  gUV[];
in  float gCell[];
in  float gMorph[];

flat out vec3 vEdgeMask;    // 1 = a real quad edge, 0 = the mesh's diagonal
out float vKind;            // 0 = paper backdrop, 1 = the body
out vec3  vBary;
out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out vec2  vUV;
out float vMorph;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float time;
uniform float audioLevel;

uniform float camDistP;

void main()
{
    // One triangle of the mesh is spent on the paper.  A blueprint without its
    // sheet is line work floating in a void, and the background has no geometry
    // of its own — so cell 0's first triangle becomes a FULLSCREEN triangle in
    // clip space instead.  Three vertices is exactly what a full-screen
    // triangle needs, which is why this fits where a quad backdrop would not.
    if (gCell[0] < 0.5 && gUV[1].y < 0.0001)
    {
        vEdgeMask = vec3(0.0); vKind = 0.0; vBary = vec3(1.0);
        vNormal = vec3(0.0, 0.0, 1.0); vView = vec3(0.0, 0.0, 1.0);
        vMorph = gMorph[0];
        vObj = vec3(-1.0, -1.0, 0.0); vUV = vec2(-1.0, -1.0);
        gl_Position = vec4(-1.0, -1.0, 0.9999, 1.0); EmitVertex();
        vObj = vec3( 3.0, -1.0, 0.0); vUV = vec2( 3.0, -1.0);
        gl_Position = vec4( 3.0, -1.0, 0.9999, 1.0); EmitVertex();
        vObj = vec3(-1.0,  3.0, 0.0); vUV = vec2(-1.0,  3.0);
        gl_Position = vec4(-1.0,  3.0, 0.9999, 1.0); EmitVertex();
        EndPrimitive();
        return;
    }

    vec3 a = gObj[0], b = gObj[1], c = gObj[2];

    // Which of the three edges are real quad edges?  The grid splits every
    // quad into two triangles, and the shared hypotenuse is not part of the
    // surface's own structure — drawn, it turns a clean quad wireframe into a
    // herringbone that advertises the triangulation.  A diagonal is the edge
    // whose endpoints differ in BOTH parameters.
    vec3 mask;
    for (int i = 0; i < 3; ++i)
    {
        vec2 d = abs(gUV[(i + 1) % 3] - gUV[(i + 2) % 3]);
        mask[i] = (d.x > 1e-6 && d.y > 1e-6) ? 0.0 : 1.0;
    }
    vEdgeMask = mask;
    vKind = 1.0;
    // Flat face normal: this is a technical drawing, so facets are the point.
    vec3 fn = normalize(cross(b - a, c - a));

    // Was driven by audioAdvance alone -- near-static whenever the music
    // is calm (measured motion 0.011). A slow constant turn keeps the
    // drawing alive; the music still adds on top.
    float ya = time * 0.22 + audioAdvance * 0.14;   // round 2: 0.08 rad/s did not register
    float pa = 0.34 * sin(audioAdvance * 0.08);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    float dist = camDistP * (1.0 - 0.04 * audioLevel);
    vec3 corner[3] = vec3[3](a, b, c);
    vec3 bary[3] = vec3[3](vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));

    for (int i = 0; i < 3; ++i)
    {
        vec3 pw = rot * corner[i];
        vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

        vBary   = bary[i];
        vObj    = corner[i];
        vNormal = rot * fn;
        vView   = normalize(-vp);
        vUV     = gUV[i];
        vMorph  = gMorph[i];

        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        EmitVertex();
    }
    EndPrimitive();
}
