#version 400 core
/**
 * @file EuropaChaosTerrain.tese
 * @brief Tessellation evaluation for EuropaChaosTerrain: the chaos terrain
 * of Europa -- ice rafts (Voronoi cells) that broke off the crust and
 * refroze tilted in a matrix of rubble ice.  Each raft is a tilted plateau
 * (tilt fixed per raft); the rafts drift very slowly on the scene clock as
 * if the matrix were still soft; the far end rises into the ridged plains
 * so the frame is full above the horizon.  The seam distance (edge of a
 * raft) goes to the fragment stage, where the ocean light comes through.
 * Projection after displacement; no camera motion.
 */
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec2  vSurfUV;
out vec3  vNormal;
out float vSeam;
out float vRaft;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
const vec2 EXTENT = vec2(160.0, 220.0);

uniform float sceneAdvance;
uniform float sceneTime;
uniform float camHP;
uniform float raftP;

vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

void voronoi(vec2 x, float clock, out float d1, out float d2, out float id, out vec2 toCentre)
{
    vec2 n = floor(x), f = fract(x);
    d1 = 8.0; d2 = 8.0; id = 0.0; toCentre = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 g = vec2(float(i), float(j));
        vec2 h = hash22(n + g);
        vec2 o = h + 0.08 * vec2(sin(clock * 0.2 + h.x * 6.28), cos(clock * 0.17 + h.y * 6.28));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; toCentre = r; }
        else if (d < d2) { d2 = d; }
    }
    d1 = sqrt(d1); d2 = sqrt(d2);
}

float surface(vec2 xz, float clock, out float seam, out float raft)
{
    float scale = 0.04 + 0.03 * clamp(raftP, 0.0, 1.0);
    float d1, d2, id; vec2 tc;
    voronoi(xz * scale, clock, d1, d2, id, tc);
    seam = d2 - d1;
    raft = id;
    // Raft: a plateau, tilted by a fixed per-raft slope.
    vec2 hh = hash22(vec2(id * 91.0, id * 37.0)) - 0.5;
    float plateau = smoothstep(0.0, 0.18, seam) * (1.6 + dot(tc, hh) * 8.0);
    // Matrix ice: low rubble.
    float rubble = 0.35 * sin(xz.x * 0.7 + id * 6.28) * sin(xz.y * 0.6) * (1.0 - smoothstep(0.0, 0.18, seam));
    // The far plains rise into ridges so the sky line is not empty.
    float rise = pow(smoothstep(100.0, 220.0, xz.y), 1.5) * 70.0 + pow(smoothstep(45.0, 220.0, abs(xz.x)), 2.0) * 50.0;
    float ridges = 1.5 * sin(xz.y * 0.25 + sin(xz.x * 0.1) * 2.0) * smoothstep(60.0, 160.0, xz.y);
    return plateau + rubble + rise + ridges;
}

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);
    vec2 xz = vec2((uv.x - 0.5) * EXTENT.x, uv.y * EXTENT.y + 3.0);

    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;
    float seam, raft;
    float h = surface(xz, clock, seam, raft);
    float e = 0.6; float s1, r1, s2, r2;
    float hx = surface(xz + vec2(e, 0.0), clock, s1, r1) - surface(xz - vec2(e, 0.0), clock, s2, r2);
    float hz = surface(xz + vec2(0.0, e), clock, s1, r1) - surface(xz - vec2(0.0, e), clock, s2, r2);
    vec3 n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));

    vec3 p = vec3(xz.x, h, xz.y);
    vWorld = p; vSurfUV = uv; vNormal = n; vSeam = seam; vRaft = raft; vDist = p.z;
    vec3 vp = vec3(p.x, p.y - camHP, p.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
