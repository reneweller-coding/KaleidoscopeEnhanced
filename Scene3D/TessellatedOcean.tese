#version 400 core
/**
 * @file TessellatedOcean.tese
 * @brief Tessellation evaluation for TessellatedOcean: Gerstner swell on the
 * scene clock (no beat-integrated phase, so the sea never lurches), the
 * wave height on the slow swell envelope only, and a phosphorescence
 * measure on the steepest crests for the fragment stage.  Projection after
 * displacement.
 */
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec2  vSurfUV;
out float vCrest;
out vec3  vNormal;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
const vec2 EXTENT = vec2(220.0, 320.0);

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioSwell;
uniform float camHP;
uniform float swellP;
uniform float choppyP;

vec3 gerstner(vec2 pos, vec2 dir, float amp, float len, float phase,
              float sharp, inout vec3 tanX, inout vec3 tanZ)
{
    float k = 6.2831853 / len;
    float f = k * dot(dir, pos) + phase;
    float s = sin(f), c = cos(f);
    vec3 d = vec3(dir.x * amp * sharp * c, amp * s, dir.y * amp * sharp * c);
    float ka = k * amp;
    tanX += vec3(-dir.x * dir.x * ka * sharp * s, dir.x * ka * c, -dir.x * dir.y * ka * sharp * s);
    tanZ += vec3(-dir.x * dir.y * ka * sharp * s, dir.y * ka * c, -dir.y * dir.y * ka * sharp * s);
    return d;
}

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);
    vec3 p = vec3((uv.x - 0.5) * EXTENT.x, 0.0, uv.y * EXTENT.y + 2.0);

    vec3 tanX = vec3(1.0, 0.0, 0.0);
    vec3 tanZ = vec3(0.0, 0.0, 1.0);

    // Height on the SLOW swell only; phase on the scene clock.
    float swell  = swellP * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float choppy = choppyP;
    float clock  = sceneAdvance * 0.7 + sceneTime * 0.25;
    float windDir = 0.55 + 0.20 * sin(clock * 0.017);
    float amp = 1.4 * swell;
    float len = 55.0;
    float rot = 0.0;
    vec3 disp = vec3(0.0);
    for (int i = 0; i < 6; ++i)
    {
        float a = windDir + rot;
        vec2 dir = vec2(cos(a), sin(a));
        float speed = sqrt(6.2831853 / len);
        disp += gerstner(p.xz, dir, amp, len, clock * speed * 3.2, choppy, tanX, tanZ);
        amp *= 0.60;
        len *= 0.52;
        rot += 0.9 + 0.4 * float(i);
    }
    p += disp;
    vec3 n = normalize(cross(tanZ, tanX));
    if (n.y < 0.0) n = -n;

    vCrest = pow(clamp(length(disp.xz) / max(0.85 * swell, 0.05) - 0.55, 0.0, 1.0), 2.0);
    vWorld  = p;
    vSurfUV = uv;
    vNormal = n;
    vDist   = p.z;

    vec3 vp = vec3(p.x, p.y - camHP, p.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
