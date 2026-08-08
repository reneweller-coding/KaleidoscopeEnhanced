#version 120
// Jellyfish.vert — a bloom of 25 bioluminescent jellyfish (60k points:
// 60 % bell shells, 40 % trailing tentacles).  ALL bells pulse to the beat
// with per-jelly phase offsets; onsets make the bloom flash.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioBeatPhase;
uniform float audioOnset;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

varying vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float jelly = floor(attrA.w / 2400.0);
    float h1 = hash11(jelly * 3.7 + 0.13);
    float h2 = hash11(jelly * 5.1 + 1.71);
    float h3 = hash11(jelly * 7.9 + 2.39);

    // Jelly drifts slowly, bobbing upward; each has its own beat phase.
    vec3 Cj = vec3((h1 - 0.5) * 70.0 + 6.0 * sin(time * 0.11 + h2 * 6.0),
                   (h2 - 0.5) * 34.0 + 4.0 * sin(time * 0.07 + h3 * 6.0),
                   22.0 + h3 * 55.0);
    float pulse = sin(6.2831853 * audioBeatPhase + h1 * 6.2831853);

    vec3  world;
    float glow;
    float bell = 3.2 + 2.6 * h2;

    if (r1 < 0.60)
    {
        // Bell: hemisphere shell, contracting with the pulse.
        float th = r2 * 6.2831853;
        float ph = r3 * 1.45;                        // 0 = top
        float R  = bell * (1.0 + 0.16 * pulse);
        world = Cj + vec3(sin(ph) * cos(th) * R,
                          cos(ph) * R * (0.75 - 0.10 * pulse),
                          sin(ph) * sin(th) * R);
        glow = 0.9 + 0.35 * pulse;
    }
    else
    {
        // Tentacles: 12 strands per jelly, wavering as they trail below.
        float strand = floor(r2 * 12.0) / 12.0;
        float t      = r3;                           // 0 top .. 1 tip
        float ang    = strand * 6.2831853;
        float sway   = sin(t * 5.0 - time * 1.6 + strand * 9.0)
                     * (0.6 + 1.8 * t);
        world = Cj + vec3(cos(ang) * bell * 0.7 + sway,
                          -(0.5 + t * (9.0 + 5.0 * h3)) - 1.2 * pulse * t,
                          sin(ang) * bell * 0.7 + sway * 0.6);
        glow = (1.0 - 0.6 * t) * (0.7 + 0.25 * pulse);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(95.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 15.0 * px);

    // Bioluminescence: cyan-violet family per jelly, keyed to the music.
    vec3 col = hueRot(vec3(0.25, 0.75, 0.95),
                      h3 * 2.2 + audioChromaHue * 0.8);
    col *= glow * (0.55 + 0.5 * audioSwell + 0.9 * audioOnset
                   + 1.3 * audioDrop)
         * clamp(1.0 - vp.z / 100.0, 0.0, 1.0);
    vCol = vec4(col * 3.2, 1.0);
}
