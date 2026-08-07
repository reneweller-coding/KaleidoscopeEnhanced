#version 120
// Fireworks.vert — a night sky of procedural fireworks at real 3D depths.
// 24 bursts of 2500 particles each; every burst runs its own smooth cycle
// (rate nudged by the music via audioAdvance), particles fly outward on
// seeded directions and droop under gravity while fading.  Kicks light the
// sparks, a drop turns the whole sky on.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioKick;
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

    float burst = floor(attrA.w / 2500.0);
    float hb1 = hash11(burst * 3.17 + 0.31);
    float hb2 = hash11(burst * 7.91 + 1.73);
    float hb3 = hash11(burst * 5.53 + 2.61);
    float hb4 = hash11(burst * 9.13 + 3.97);

    // Burst position in the sky (varied depth -> real stereo layering).
    vec3 Cb = vec3((hb1 - 0.5) * 90.0, 16.0 + hb2 * 22.0, 22.0 + hb3 * 60.0);

    // Smooth burst cycle: progress driven by time + integrated audio rate.
    float u = fract((time + audioAdvance * 1.6) * (0.16 + 0.09 * hb4)
                    + hb1 * 7.0);

    // Particle flight: seeded sphere direction, ease-out expansion, gravity.
    float th = r1 * 6.2831853;
    float ph = acos(2.0 * r2 - 1.0);
    vec3  d  = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
    float sp = 8.0 + 7.0 * r3;
    float re = sp * (1.0 - exp(-u * 4.0)) * 1.1;
    vec3 world = Cb + d * re + vec3(0.0, -15.0 * u * u, 0.0);

    // Fixed vantage point; the field spreads in front of it.
    vec3 vp = vec3(world.x, world.y - 10.0, world.z + 12.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Brightness: explode fast, fade with a slow twinkle over the cycle.
    float B = smoothstep(0.015, 0.05, u) * exp(-u * 1.7)
            * (0.7 + 0.3 * sin(u * 40.0 + r4 * 20.0))
            * (1.0 + 0.9 * audioKick + 1.6 * audioDrop);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(110.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 24.0 * px)
                 * (0.6 + 0.7 * B);

    // Per-burst colour family, key-shifted; late sparks cool to embers.
    vec3 col = hueRot(vec3(1.0, 0.62, 0.25), hb3 * 5.0 + audioChromaHue);
    col = mix(col, vec3(1.0, 0.35, 0.15), smoothstep(0.45, 0.8, u));
    col *= B * (0.9 + 0.4 * audioSwell) * clamp(1.0 - vp.z / 150.0, 0.0, 1.0);
    vCol = vec4(col * 3.0, 1.0);
}
