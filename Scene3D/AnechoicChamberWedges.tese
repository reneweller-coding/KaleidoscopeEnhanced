#version 400 core
/**
 * @file AnechoicChamberWedges.tese
 * @brief Tessellation evaluation for AnechoicChamberWedges: the far wall
 * of an anechoic chamber -- a field of foam wedges (pyramids on a grid)
 * facing the camera, filling the frame.  The (u,v) patch plane is the
 * wall; each wedge rises toward the camera by a triangle-wave height so
 * the ridges are sharp.  Nothing moves: the wall is fixed.  The wedge
 * index and the height along the wedge go to the fragment stage, where
 * the bands light the tips.  No camera motion.
 */
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec2  vSurfUV;
out vec3  vNormal;
out float vWedge;
out float vHeight;

uniform mat4  projM;
uniform float eyeOff;
const vec2 EXTENT = vec2(24.0, 14.0);

uniform float wedgeP;

float tri(float x) { return 1.0 - abs(fract(x) * 2.0 - 1.0); }     // 0..1..0 triangle wave

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);
    float cols = 12.0 + 8.0 * clamp(wedgeP, 0.0, 1.0);
    float rows = cols * EXTENT.y / EXTENT.x;
    vec2 g = vec2(uv.x * cols, uv.y * rows);
    // Wedge height: a pyramid in each cell (min of the two triangle waves).
    float hx = tri(g.x), hy = tri(g.y);
    float h = min(hx, hy) * 1.6;
    vec3 p = vec3((uv.x - 0.5) * EXTENT.x, (uv.y - 0.5) * EXTENT.y, 11.0 - h);
    // Normal from the pyramid face: the gradient of min(tri, tri).
    vec2 cellF = fract(g) - 0.5;
    vec3 n;
    if (abs(cellF.x) > abs(cellF.y)) n = normalize(vec3(sign(cellF.x) * 1.6 * cols / EXTENT.x * 2.0, 0.0, 1.0));
    else                             n = normalize(vec3(0.0, sign(cellF.y) * 1.6 * rows / EXTENT.y * 2.0, 1.0));
    n.z = -n.z;                                                    // faces the camera (-z)
    vWorld = p; vSurfUV = uv; vNormal = n;
    vWedge = floor(g.x) + floor(g.y) * cols;
    vHeight = h / 1.6;
    vec3 vp = vec3(p.x - eyeOff, p.y, p.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
