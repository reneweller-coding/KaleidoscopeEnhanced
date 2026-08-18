#version 330 core
/**
 * @file FireflyField.vert
 * @brief Vertex stage companion to FireflyField.frag -- see that file's header for
 * this scene's description.
 */
// FireflyField.vert — a summer night meadow: thousands of fireflies drift
// on lazy paths and blink softly; a slow wave of synchrony sweeps the
// field with the beat phase (real fireflies do this!).  Deeply calm.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioBeatPhase;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Home position low over the meadow, drifting on slow sine paths.
    vec3 home = vec3((r1 - 0.5) * 110.0,
                     -6.0 + r2 * r2 * 16.0,
                     10.0 + r3 * 80.0);
    vec3 world = home
               + vec3(sin(time * 0.23 + r4 * 40.0) * 2.5,
                      sin(time * 0.31 + r1 * 40.0) * 1.2,
                      sin(time * 0.19 + r2 * 40.0) * 2.5);

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Blink: own slow rhythm + a soft synchrony wave sweeping in x with
    // the beat phase — smooth envelopes only, no strobing.
    float own  = 0.5 + 0.5 * sin(time * (0.8 + r2 * 1.4) + r3 * 40.0);
    float sync = 0.5 + 0.5 * sin(6.2831853 * audioBeatPhase
                                 - world.x * 0.05);
    float blink = pow(own * 0.5 + sync * 0.5, 2.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(135.0 * (0.4 + 0.7 * r4) * px / dist, 1.5, 14.0 * px)
                 * (0.6 + 0.5 * blink);

    // Warm green-gold, a rare cool one.
    vec3 col = (r1 > 0.94) ? vec3(0.5, 0.75, 0.9) : vec3(0.75, 0.9, 0.25);
    col = hueRot(col, audioChromaHue * 0.2);
    col *= blink * (0.65 + 0.4 * audioSwell + 0.25 * audioLevel)
         * clamp(1.0 - vp.z / 100.0, 0.0, 1.0);
    vCol = vec4(col * 3.8, 1.0);
}
