#version 400 core
/**
 * @file TessellatedLavaLake.tese
 * @brief Tessellation evaluation for TessellatedLavaLake: a lava lake whose
 * crust has broken into plates (Voronoi cells) that drift slowly on the
 * scene clock over a swelling lava surface.  Each plate rides a little
 * higher than the melt between (a plateau per cell, softened at the
 * seams), and the whole surface heaves on a slow wave (amplitude on the
 * swell).  The seam distance (how close to a plate edge) goes to the
 * fragment stage: that is where the glow lives.  Projection after
 * displacement; no camera motion.
 */
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;   ///< World position (from the vertex stage).
out vec2  vSurfUV;
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out float vSeam;
out float vPlate;
out float vDist;   ///< Distance (from the vertex stage).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
const vec2 EXTENT = vec2(160.0, 220.0);

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float camHP;   ///< Camera height knob, 0..1.
uniform float plateP;

/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

/// Voronoi: distance to the nearest and second-nearest plate centre; the
/// centres drift slowly on the clock (each on its own small circle).
void voronoi(vec2 x, float clock, out float d1, out float d2, out float id)
{
    vec2 n = floor(x), f = fract(x);
    d1 = 8.0; d2 = 8.0; id = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 g = vec2(float(i), float(j));
        vec2 h = hash22(n + g);
        vec2 o = h + 0.25 * vec2(sin(clock * 0.3 + h.x * 6.28), cos(clock * 0.27 + h.y * 6.28));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; }
        else if (d < d2) { d2 = d; }
    }
    d1 = sqrt(d1); d2 = sqrt(d2);
}

float surface(vec2 xz, float clock, float heave, out float seam, out float plate)
{
    float scale = 0.05 + 0.04 * clamp(plateP, 0.0, 1.0);
    float d1, d2, id;
    voronoi(xz * scale, clock, d1, d2, id);
    seam = d2 - d1;                                   // 0 at a plate edge
    plate = id;
    float plateau = smoothstep(0.0, 0.25, seam) * 1.2;   // plates ride high
    float wave = sin(xz.x * 0.05 + clock * 0.4) * sin(xz.y * 0.04 - clock * 0.3) * heave;
    // The crater wall: the far end of the lake rises into a glowing cliff
    // so the frame is filled above the horizon.
    float wall = pow(smoothstep(110.0, 220.0, xz.y), 1.6) * 95.0 + pow(smoothstep(40.0, 220.0, abs(xz.x)), 2.0) * 70.0;
    return plateau + wave + 0.3 * sin(xz.x * 0.3 + id * 6.28) * sin(xz.y * 0.27) + wall;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);
    vec2 xz = vec2((uv.x - 0.5) * EXTENT.x, uv.y * EXTENT.y + 3.0);

    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;
    float heave = 0.6 + 1.2 * clamp(audioSwell, 0.0, 1.0);
    float seam, plate;
    float h = surface(xz, clock, heave, seam, plate);
    float e = 0.6; float s1, s2, p1, p2;
    float hx = surface(xz + vec2(e, 0.0), clock, heave, s1, p1) - surface(xz - vec2(e, 0.0), clock, heave, s2, p2);
    float hz = surface(xz + vec2(0.0, e), clock, heave, s1, p1) - surface(xz - vec2(0.0, e), clock, heave, s2, p2);
    vec3 n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));

    vec3 p = vec3(xz.x, h, xz.y);
    vWorld = p; vSurfUV = uv; vNormal = n; vSeam = seam; vPlate = plate; vDist = p.z;
    vec3 vp = vec3(p.x, p.y - camHP, p.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
