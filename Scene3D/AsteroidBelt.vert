#version 120
// AsteroidBelt.vert — drifting through an asteroid belt: 4900 tumbling
// rocks at every scale, sunlight from one side, kicks kick the throttle,
// a drop lights every rock's rim like a solar flare.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioSwell;

varying vec4 vCol;
varying vec3 vCorner;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Belt slab ahead; every rock loops independently down the flight path.
    float camZ = time * 5.0 + audioAdvance * 18.0;
    float L    = 220.0;
    float z    = mod(r3 * L - camZ, L) + 2.0;

    vec3 centre = vec3((r1 - 0.5) * 130.0,
                       (r2 - 0.5) * 55.0,
                       z);

    // Whole-rock cull outside the visible corridor.
    if (z < 1.5 || z > 130.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    // Tumble: each rock spins around a seeded axis (two-plane rotation).
    float s  = (r4 < 0.94) ? (0.4 + 2.2 * r4 * r4) : (3.5 + 5.0 * (r4 - 0.94) * 16.0);
    float a1 = time * (0.3 + r1 * 0.8) + r2 * 6.28;
    float a2 = time * (0.2 + r2 * 0.6) + r3 * 6.28;
    vec3 c = attrA.xyz;
    c.xy = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * c.xy;
    c.yz = mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * c.yz;
    // Squash into an irregular shard.
    c *= vec3(1.0, 0.55 + 0.8 * r2, 0.7 + 0.6 * r3);

    vec3 world = centre + c * s;

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    // Sunlight from the upper right; rocks are grey-brown regolith.
    vec3 n = normalize(c);
    float lit = clamp(dot(n, normalize(vec3(0.7, 0.5, -0.4))), 0.06, 1.0);
    vec3 col = mix(vec3(0.38, 0.33, 0.28), vec3(0.55, 0.53, 0.50), r4)
             * lit * (1.1 + 0.5 * audioSwell + 0.5 * audioKick);
    col = hueRot(col, audioChromaHue * 0.2);
    col *= 1.0 + 1.6 * audioDrop;
    col *= clamp(1.0 - z / 130.0, 0.0, 1.0) * 1.5;

    vCol    = vec4(col, 1.0);
    vCorner = attrA.xyz;
}
