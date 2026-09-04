#version 400 core
/**
 * @file RiceTerracesDawn.tese
 * @brief Tessellation evaluation for RiceTerracesDawn: a hillside cut into
 * flooded rice paddies.  Unlike the travertine terraces, these follow the
 * CONTOURS of the hill: the terrace index comes from the hill height
 * itself, so the bunds curve around every spur and re-entrant the way
 * hand-built paddies do.
 *
 * Height = the hill, quantised to terrace steps with a smooth riser (a
 * hard step would be a discontinuity), plus the raised bund at each edge.
 * The paddy floors are dead flat, which is the whole point of a paddy.
 */
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec2  vSurfUV;
out vec3  vNormal;
out float vPaddy;     // 1 in the flat flooded floor, 0 on a bund
out float vLevel;     // continuous terrace index
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
const vec2 EXTENT = vec2(285.0, 230.0);

uniform float sceneAdvance;
uniform float sceneTime;
uniform float camHP;
uniform float stepsP;
uniform float audioSwell;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.02 + 3.3; a *= 0.5; } return v; }

// The bare hill, before the terraces are cut into it.
float hill(vec2 xz)
{
    // The valley floor lies flat AT the camera and only rises further out.
    // Without this ramp the hill stands where the camera is and the scene
    // renders from inside the ground -- a black frame with a swirl of
    // contours in it, which is exactly what the first cut did.
    float away = smoothstep(6.0, 70.0, xz.y);
    float h = (10.0 * fbm(xz * 0.008) + 16.0 * fbm(xz * 0.0032 + 4.0)) * away;
    h += pow(smoothstep(60.0, 230.0, xz.y), 1.3) * 105.0;   // fills the horizon: there is no sky quad here
    h += pow(smoothstep(50.0, 210.0, abs(xz.x)), 1.7) * 55.0 * away;
    return h;
}

float surface(vec2 xz, out float paddy, out float level)
{
    float stepsN = 7.0 + 7.0 * clamp(stepsP, 0.0, 1.0);
    float raw = hill(xz);
    float t = raw * stepsN * 0.06;
    level = t;
    float f = fract(t);
    // The riser between paddies: smooth, so the surface stays continuous.
    float riser = smoothstep(0.0, 0.22, f);
    float h = (floor(t) + riser) / (stepsN * 0.06);
    // The bund: a raised lip at the downhill edge of each paddy.
    float bund = exp(-pow((f - 0.1) / 0.07, 2.0)) * 0.5;
    h += bund;
    // The paddy floor is flat and holds water.
    paddy = smoothstep(0.2, 0.38, f);
    // A little soil texture on the bunds only, so the floors stay level.
    h += (1.0 - paddy) * 0.12 * fbm(xz * 0.9);
    return h;
}

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);
    vec2 xz = vec2((uv.x - 0.5) * EXTENT.x, uv.y * EXTENT.y + 3.0);

    float paddy, level;
    float h = surface(xz, paddy, level);
    float e = 0.5; float p1, l1, p2, l2;
    float hx = surface(xz + vec2(e, 0.0), p1, l1) - surface(xz - vec2(e, 0.0), p2, l2);
    float hz = surface(xz + vec2(0.0, e), p1, l1) - surface(xz - vec2(0.0, e), p2, l2);
    vec3 n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));

    vec3 p = vec3(xz.x, h, xz.y);
    vWorld = p; vSurfUV = uv; vNormal = n; vPaddy = paddy; vLevel = level; vDist = p.z;
    vec3 vp = vec3(p.x, p.y - camHP, p.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
