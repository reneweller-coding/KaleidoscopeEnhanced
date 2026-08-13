#version 330 core
// RainOnWater.vert — a still pond at night; raindrops land on their own
// unhurried clocks and send damped rings gliding outward.  The music sets
// the rain's density and the moon's warmth — the pond stays a pond.
// attrA.x/.y span the surface.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioLevel;
uniform float audioSwell;

out vec3  vWorld;
out float vSlope;
out float vDist;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float u = attrA.x, w = attrA.y;

    float x = (u - 0.5) * 160.0;
    float z = 3.0 + w * 130.0;

    // Twelve raindrop sites on staggered cycles; each ring expands and
    // dies away smoothly.  More music -> slightly denser rain.
    float h = 0.0;
    float slope = 0.0;
    for (int i = 0; i < 12; ++i)
    {
        float fi = float(i);
        float cycle = 4.0 + hash11(fi * 3.3) * 5.0;
        float t01 = fract(time / cycle + hash11(fi * 7.7));
        vec2 C = vec2((hash11(fi * 1.7 + floor(time / cycle + hash11(fi * 7.7))) - 0.5) * 130.0,
                      10.0 + hash11(fi * 9.1 + floor(time / cycle + hash11(fi * 7.7))) * 110.0);
        float d = length(vec2(x, z) - C);
        float ringR = t01 * 42.0;
        float wave = sin((d - ringR) * 0.9) * exp(-abs(d - ringR) * 0.28)
                   * (1.0 - t01) * 0.8;
        h += wave;
        slope += wave * 0.9;
    }
    h *= 0.8 + 0.5 * audioLevel;

    // A faint standing swell keeps the far water alive.
    h += sin(x * 0.05 + time * 0.5) * sin(z * 0.06 + time * 0.4) * 0.25
       * (1.0 + audioSwell);

    vec3 vp = vec3(x, h - 7.0, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vWorld = vec3(x, h, z);
    vSlope = slope;
    vDist  = z;
}
