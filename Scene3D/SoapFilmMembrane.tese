#version 400 core
/**
 * @file SoapFilmMembrane.tese
 * @brief Tessellation evaluation for SoapFilmMembrane: a soap film stretched
 * in a frame in front of the camera, bulging and rippling as a film does --
 * standing modes of the rectangle on the scene clock, amplitude on the slow
 * swell, plus a slow breath (the film blown gently).  The film thickness
 * (for the interference colour) is computed here: it drains downward over
 * the arc (thin at the top, thick at the bottom) and follows the ripples.
 * Projection after displacement; no camera motion.
 */
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec2  vSurfUV;
out vec3  vNormal;
out float vThick;

uniform mat4  projM;
uniform float eyeOff;
const vec2 EXTENT = vec2(14.0, 9.0);

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioSwell;
uniform float modesP;
uniform float drainP;

float height(vec2 uv, float clock, float amp, float modes)
{
    // Standing modes of a rectangle (edges pinned: sin(m pi u) sin(n pi v)).
    float h = 0.0;
    h += sin(uv.x * 3.14159) * sin(uv.y * 3.14159) * sin(clock * 0.7) * 1.0;
    h += sin(uv.x * 6.28318) * sin(uv.y * 3.14159) * sin(clock * 1.1 + 1.0) * 0.5 * modes;
    h += sin(uv.x * 3.14159) * sin(uv.y * 6.28318) * sin(clock * 0.9 + 2.0) * 0.5 * modes;
    h += sin(uv.x * 9.42477) * sin(uv.y * 6.28318) * sin(clock * 1.6 + 0.5) * 0.25 * modes;
    return h * amp;
}

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);

    float clock = sceneAdvance * 0.6 + sceneTime * 0.15;
    float amp = 0.25 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float modes = 0.5 + 1.0 * clamp(modesP, 0.0, 1.0);
    float breath = 0.35 * sin(clock * 0.23) * sin(uv.x * 3.14159) * sin(uv.y * 3.14159);
    float h = height(uv, clock, amp, modes) + breath;
    // Normal by finite differences.
    float e = 0.004;
    float hx = height(uv + vec2(e, 0.0), clock, amp, modes) - height(uv - vec2(e, 0.0), clock, amp, modes);
    float hy = height(uv + vec2(0.0, e), clock, amp, modes) - height(uv - vec2(0.0, e), clock, amp, modes);
    vec3 n = normalize(vec3(-hx / (2.0 * e) / EXTENT.x, -hy / (2.0 * e) / EXTENT.y, 1.0));

    vec3 p = vec3((uv.x - 0.5) * EXTENT.x, (uv.y - 0.5) * EXTENT.y, 9.0 - h);
    // Thickness: drains down over the arc (the top thins first), ripples
    // add a little, in the 300..900 nm range (units: nm / 100).
    float drain = clamp(sceneProgress, 0.0, 1.0) * (0.4 + 0.6 * clamp(drainP, 0.0, 1.0));
    float thick = 8.0 - 5.5 * drain * (0.3 + 0.7 * uv.y) + 0.8 * h - 1.5 * drain;
    vThick = max(thick, 0.6);

    vWorld  = p;
    vSurfUV = uv;
    vNormal = n;
    vec3 vp = vec3(p.x - eyeOff, p.y, p.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
