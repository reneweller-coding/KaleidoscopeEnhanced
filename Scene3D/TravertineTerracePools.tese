#version 400 core
/**
 * @file TravertineTerracePools.tese
 * @brief Tessellation evaluation for TravertineTerracePools: a hillside of
 * travertine -- water carrying dissolved lime spills down a slope and
 * leaves rimstone dams behind, so the hill becomes a stack of shallow
 * pools, each held by a lip that bulges where the water runs fastest.
 *
 * The height is built from three parts: a slope that falls toward the
 * camera, a terrace staircase whose STEP EDGES are smoothed (a hard step
 * would be a discontinuity, and the rule of this catalogue is that every
 * surface is continuous), and the rim bulge just behind each lip.  The
 * water level in each pool breathes with the swell -- slow, and only the
 * level, never the geometry of the dam.
 *
 * The far end rises into the hill so the horizon is filled.
 */
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;   ///< World position (from the vertex stage).
out vec2  vSurfUV;
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out float vPool;      ///< 0 on a rim, 1 in the middle of a pool
out float vTerrace;   ///< continuous terrace index
out float vDist;   ///< Distance (from the vertex stage).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
const vec2 EXTENT = vec2(260.0, 210.0);

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float camHP;   ///< Camera height knob, 0..1.
uniform float stepsP;
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 4.1; a *= 0.5; } return v; }

/// The terrace field.  Returns the height; pool and terrace come back too.
float surface(vec2 xz, out float pool, out float terrace)
{
    float stepsN = 5.0 + 5.0 * clamp(stepsP, 0.0, 1.0);
    // The slope runs downhill toward the camera, waving so the rims are
    // not straight lines.
    float down = xz.y * 0.055 + 0.9 * fbm(xz * 0.012) + 0.35 * sin(xz.x * 0.035);
    float t = down * stepsN * 0.3;
    terrace = t;
    float f = fract(t);
    // The staircase: a smoothstep riser instead of a hard step -- the whole
    // point of a continuous surface.  The lip sits at f near 0.
    float riser = smoothstep(0.0, 0.28, f);
    float h = (floor(t) + riser) * (2.4 / (stepsN * 0.3));
    // The rim bulge: travertine grows fastest where the water pours over.
    float bulge = exp(-pow((f - 0.12) / 0.09, 2.0)) * 0.55;
    h += bulge;
    // Inside a pool the floor is nearly flat, with a faint ripple pattern.
    pool = smoothstep(0.3, 0.55, f);
    h += pool * 0.06 * sin(xz.x * 0.7 + xz.y * 0.5);
    // Fine crust texture everywhere.
    h += 0.09 * fbm(xz * 0.6);
    // The hill rises at the far end and to the sides, so the horizon is full.
    h += pow(smoothstep(60.0, 210.0, xz.y), 1.3) * 100.0;   // fills the horizon: a patches scene has no sky
    h += pow(smoothstep(40.0, 200.0, abs(xz.x)), 1.7) * 60.0;
    return h;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);
    vec2 xz = vec2((uv.x - 0.5) * EXTENT.x, uv.y * EXTENT.y + 3.0);

    float pool, terrace;
    float h = surface(xz, pool, terrace);
    float e = 0.45; float p1, t1, p2, t2;
    float hx = surface(xz + vec2(e, 0.0), p1, t1) - surface(xz - vec2(e, 0.0), p2, t2);
    float hz = surface(xz + vec2(0.0, e), p1, t1) - surface(xz - vec2(0.0, e), p2, t2);
    vec3 n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));

    vec3 p = vec3(xz.x, h, xz.y);
    vWorld = p; vSurfUV = uv; vNormal = n; vPool = pool; vTerrace = terrace; vDist = p.z;
    vec3 vp = vec3(p.x, p.y - camHP, p.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
