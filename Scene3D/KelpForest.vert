#version 330 core
// KelpForest.vert — an underwater kelp forest swaying in the surge: each
// ribbon is one kelp frond anchored on the sea floor; the swell IS the
// surge, caustic light ripples from above.  attrA.x = height 0..1,
// attrA.y = side, attrA.w = frond index.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioBarPhase;

out vec4  vCol;
out float vSide;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float t    = attrA.x;                    // 0 root .. 1 tip
    float side = attrA.y;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Frond anchors scattered on the floor ahead of the camera.
    vec3 root = vec3((r1 - 0.5) * 90.0, -12.0, 12.0 + r2 * 70.0);
    float H   = 22.0 + 14.0 * r3;

    // Surge: one broad push per bar plus fine flutter, growing toward
    // the free tip.
    float surge = sin(6.2831853 * audioBarPhase + r1 * 6.2831853)
                * (0.8 + 1.6 * audioSwell);
    float flutter = sin(t * 6.0 - time * 1.7 + r4 * 6.2831853);
    float bendX = (surge * 4.5 + flutter * 1.2) * t * t;
    float bendZ = (surge * 1.5 + cos(t * 5.0 - time * 1.3 + r2 * 9.0))
                * t * t * 0.8;

    // Blade widens mid-frond, tapers at the tip.
    float wHalf = (0.55 + 0.9 * r4) * sin(3.14159265 * min(t * 1.15, 1.0));

    vec3 pos = root + vec3(bendX + side * wHalf, t * H, bendZ);

    vec3 vp = pos;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Deep green-teal, sunlit toward the tips, caustic bands wandering.
    vec3 col = mix(vec3(0.02, 0.16, 0.10), vec3(0.10, 0.55, 0.30), t);
    float caustic = 0.6 + 0.4 * sin(pos.x * 0.35 + pos.y * 0.22
                                    + time * 1.1);
    col *= 0.5 + 0.9 * caustic * (0.5 + 0.5 * t);
    col = hueRot(col, audioChromaHue * 0.35);
    col *= (0.6 + 0.5 * audioLevel + 0.4 * audioSwell)
         * clamp(1.0 - vp.z / 100.0, 0.0, 1.0) * 1.15;

    vCol  = vec4(col, 1.0);
    vSide = side;
}
