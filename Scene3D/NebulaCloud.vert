#version 120
// NebulaCloud.vert — a soft nebula: particles gathered in seeded clumps,
// the whole cloud kneaded by slow sine winds and turning around its axis;
// hue drifts with the music's key.  Nothing here ever hurries.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioCentroid;

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

    // Clumpy distribution: 40 seeded knots, particles gaussian-ish around
    // them (sum of two uniforms leans centre-heavy).
    float knot = floor(attrA.w / 1500.0);
    vec3 Ck = vec3(hash11(knot * 3.1 + 0.7) - 0.5,
                   (hash11(knot * 5.3 + 1.9) - 0.5) * 0.55,
                   hash11(knot * 7.7 + 3.2) - 0.5) * 44.0;
    vec3 world = Ck + (vec3(r1 + r2, r2 + r3, r3 + r4) - 1.0) * 9.0;

    // Slow sine winds knead the cloud; the whole nebula rotates.
    float ph = time * 0.06;
    world.x += sin(world.y * 0.10 + ph * 2.0) * 2.5;
    world.y += sin(world.z * 0.09 + ph * 1.6) * 1.8;
    world.z += sin(world.x * 0.08 + ph * 1.2) * 2.2;
    float ra = time * 0.025;
    world.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * world.xz;

    vec3 vp = world + vec3(0.0, 0.0, 46.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(160.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 22.0 * px);

    // Two colour families blend across the cloud (emission vs reflection
    // nebula); a few hot young stars pierce through.
    vec3 emis = hueRot(vec3(0.85, 0.30, 0.45), audioChromaHue * 0.6);
    vec3 refl = hueRot(vec3(0.25, 0.45, 0.90), audioChromaHue * 0.6);
    vec3 col  = mix(emis, refl, hash11(knot * 9.9 + 0.3));
    if (r4 > 0.985)
        col = vec3(0.95, 0.97, 1.0) * 2.2;   // embedded stars
    col *= (0.22 + 0.30 * r3)
         * (0.7 + 0.45 * audioSwell + 0.3 * audioLevel)
         * (0.85 + 0.3 * audioCentroid)
         * clamp(1.0 - vp.z / 110.0, 0.0, 1.0);
    vCol = vec4(col * 3.2, 1.0);
}
