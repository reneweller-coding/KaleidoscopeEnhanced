#version 400 core
// Ocean.tese — place and displace every generated vertex.
// -----------------------------------------------------------------------
// Gerstner waves: unlike a plain sine heightfield, each wave also moves the
// surface HORIZONTALLY against its direction of travel, which is what gives
// real swell its sharp crests and broad troughs.  Six octaves, each turned
// against the main wind so the crests interfere instead of forming one
// endless corrugation.
//
// Projection happens HERE, after the displacement.  In the vertex shader it
// would project the flat patch corners and the tessellator would then
// interpolate in clip space — the waves would be invisible.
// -----------------------------------------------------------------------
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec2  vSurfUV;
out float vFoam;
out vec3  vNormal;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
// The sheet's world size.  Shared by the control and evaluation stages —
// if these ever disagree, the two stages place the same patch in different
// spots and the surface tears along every seam.
const vec2 EXTENT = vec2(220.0, 320.0);

// audioAdvance is the engine's HOST-INTEGRATED travel phase, and uniforms are
// program-wide, so the tessellation stages see it without any engine change.
// Using it (rather than time x a level) is what keeps the swell flicker-free.
uniform float audioAdvance;
uniform float audioSubBass;
uniform float audioKick;
uniform float camHP;        // preset: camera height
uniform float swellP;       // preset: wave height
uniform float choppyP;      // preset: Gerstner pinch

// One Gerstner wave.  Accumulates the analytic tangent frame, so the normal
// is exact and needs no finite differences (which would alias badly once the
// tessellation level changes between neighbouring patches).
vec3 gerstner(vec2 pos, vec2 dir, float amp, float len, float phase,
              float sharp, inout vec3 tanX, inout vec3 tanZ)
{
    float k = 6.2831853 / len;
    float f = k * dot(dir, pos) + phase;
    float s = sin(f), c = cos(f);

    vec3 d = vec3(dir.x * amp * sharp * c, amp * s, dir.y * amp * sharp * c);

    float ka = k * amp;
    tanX += vec3(-dir.x * dir.x * ka * sharp * s,
                  dir.x * ka * c,
                 -dir.x * dir.y * ka * sharp * s);
    tanZ += vec3(-dir.x * dir.y * ka * sharp * s,
                  dir.y * ka * c,
                 -dir.y * dir.y * ka * sharp * s);
    return d;
}

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);

    // z runs AHEAD of the camera (the engine projects with -z).
    vec3 p = vec3((uv.x - 0.5) * EXTENT.x, 0.0, uv.y * EXTENT.y + 2.0);

    vec3 tanX = vec3(1.0, 0.0, 0.0);
    vec3 tanZ = vec3(0.0, 0.0, 1.0);

    float swell  = swellP * (1.0 + 0.55 * audioSubBass + 0.30 * audioKick);
    float choppy = choppyP;
    float windDir = 0.55 + 0.20 * sin(audioAdvance * 0.017);
    float wavePhase = audioAdvance * 0.85;

    float amp = 1.5 * swell;
    float len = 55.0;
    float rot = 0.0;
    vec3 disp = vec3(0.0);
    for (int i = 0; i < 6; ++i)
    {
        float a = windDir + rot;
        vec2 dir = vec2(cos(a), sin(a));
        // Deep-water dispersion: shorter waves travel slower, which is what
        // keeps the octaves from marching in lockstep.
        float speed = sqrt(6.2831853 / len);
        disp += gerstner(p.xz, dir, amp, len, wavePhase * speed * 3.2,
                         choppy, tanX, tanZ);
        amp *= 0.60;
        len *= 0.52;
        rot += 0.9 + 0.4 * float(i);
    }

    p += disp;

    vec3 n = normalize(cross(tanZ, tanX));
    if (n.y < 0.0) n = -n;

    // Foam on the crests: the horizontal pinch is largest exactly where a
    // Gerstner wave is about to break, so |disp.xz| is the natural measure.
    // Only the STEEPEST crests foam.  A low threshold whitens every wave and
    // the sea turns into a field of ice floes.
    vFoam = clamp(length(disp.xz) / max(0.85 * swell, 0.05) - 0.62, 0.0, 1.0);
    vFoam = pow(vFoam, 2.4);

    vWorld  = p;
    vSurfUV = uv;
    vNormal = n;
    vDist   = p.z;

    vec3 vp = vec3(p.x, p.y - camHP, p.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
