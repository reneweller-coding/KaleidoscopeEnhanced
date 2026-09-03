#version 400 core
/**
 * @file PermafrostPolygons.tese
 * @brief Tessellation evaluation for PermafrostPolygons: patterned ground
 * of the tundra -- ice-wedge polygons, each a low-centred cell rimmed by
 * ridges, the troughs between them flooded with meltwater.  The polygons
 * are a Voronoi field (centres fixed; only the water level breathes on
 * the swell), the far tundra rises into low hills so the horizon is full.
 * The trough depth and the cell id go to the fragment stage.  Projection
 * after displacement; no camera motion.
 */
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec2  vSurfUV;
out vec3  vNormal;
out float vTrough;
out float vCell;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
const vec2 EXTENT = vec2(160.0, 220.0);

uniform float sceneAdvance;
uniform float sceneTime;
uniform float camHP;
uniform float cellP;

vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

void voronoi(vec2 x, out float d1, out float d2, out float id)
{
    vec2 n = floor(x), f = fract(x);
    d1 = 8.0; d2 = 8.0; id = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 g = vec2(float(i), float(j));
        vec2 h = hash22(n + g);
        vec2 r = g + h - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; }
        else if (d < d2) { d2 = d; }
    }
    d1 = sqrt(d1); d2 = sqrt(d2);
}

float surface(vec2 xz, out float trough, out float cell)
{
    float scale = 0.05 + 0.04 * clamp(cellP, 0.0, 1.0);
    float d1, d2, id;
    voronoi(xz * scale, d1, d2, id);
    float seam = d2 - d1;
    cell = id;
    // The rim ridge near the edge, the low centre, the trough at the edge.
    float ridge = exp(-pow((seam - 0.12) / 0.06, 2.0)) * 0.9;
    float centreDip = smoothstep(0.12, 0.5, seam) * -0.5;
    trough = 1.0 - smoothstep(0.0, 0.08, seam);
    float h = ridge + centreDip - trough * 0.6;
    h += 0.15 * sin(xz.x * 0.4 + id * 6.28) * sin(xz.y * 0.35);
    // Far hills so the horizon is filled.
    float rise = pow(smoothstep(110.0, 220.0, xz.y), 1.5) * 40.0 + pow(smoothstep(50.0, 220.0, abs(xz.x)), 2.0) * 30.0;
    return h + rise;
}

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);
    vec2 xz = vec2((uv.x - 0.5) * EXTENT.x, uv.y * EXTENT.y + 3.0);

    float trough, cell;
    float h = surface(xz, trough, cell);
    float e = 0.5; float t1, c1, t2, c2;
    float hx = surface(xz + vec2(e, 0.0), t1, c1) - surface(xz - vec2(e, 0.0), t2, c2);
    float hz = surface(xz + vec2(0.0, e), t1, c1) - surface(xz - vec2(0.0, e), t2, c2);
    vec3 n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));

    vec3 p = vec3(xz.x, h, xz.y);
    vWorld = p; vSurfUV = uv; vNormal = n; vTrough = trough; vCell = cell; vDist = p.z;
    vec3 vp = vec3(p.x, p.y - camHP, p.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
