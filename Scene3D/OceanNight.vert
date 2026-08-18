#version 330 core
// OceanNight.vert — a moonlit night ocean: the grid is the water surface,
// three travelling wave trains sum into swell; the bass IS the sea state,
// kicks send a circular wavefront out from below the moon.
// attrA.x = across, attrA.y = toward the horizon.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;
uniform float audioKick;
uniform float audioAdvance;

out vec3  vWorld;
out float vSpec;
out float vDist;

void main()
{
    float u = attrA.x, w = attrA.y;

    float x = (u - 0.5) * 240.0;
    float z = 2.0 + w * 200.0;

    float sea = 1.0 + 1.6 * audioBass + 0.8 * audioSwell;

    // Three wave trains (phase carries the music's advance).
    float t1 = time * 0.9 + audioAdvance * 1.2;
    float h = sin(x * 0.055 + z * 0.030 + t1)        * 1.35
            + sin(x * 0.021 - z * 0.043 + t1 * 0.7)  * 2.10
            + sin(x * 0.110 + z * 0.089 - t1 * 1.3)  * 0.55
            // short chop: the surface detail the flat version lacked
            + sin(x * 0.230 + z * 0.170 - t1 * 2.1)  * 0.30
            + sin(x * 0.310 - z * 0.260 + t1 * 1.7)  * 0.20;
    h *= sea;

    // Kick ring rolling outward from the moon's reflection point.
    float d = length(vec2(x, z - 90.0));
    h += sin(d * 0.35 - time * 6.0) * exp(-d * 0.03) * 2.2 * audioKick;

    vec3 vp = vec3(x, h - 7.0, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Analytic slope -> moon-glitter term (moon sits high, far, dead ahead).
    float ddz = cos(x * 0.055 + z * 0.030 + t1) * 0.030 * 1.35
              - cos(x * 0.021 - z * 0.043 + t1 * 0.7) * 0.043 * 2.10
              + cos(x * 0.230 + z * 0.170 - t1 * 2.1) * 0.170 * 0.30;
    vSpec = clamp(1.0 - abs(ddz * sea * 3.0 + x * 0.004), 0.0, 1.0);

    vWorld = vec3(x, h, z);
    vDist  = z;
}
