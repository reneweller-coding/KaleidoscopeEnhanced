#version 120
// Tornado.vert — a debris vortex under a storm sky: 60k particles spiral in
// a funnel whose spin rate follows the music's energy; kicks cinch the
// funnel tight, snares crackle lightning-white debris.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioSnare;
uniform float audioChromaHue;
uniform float audioDrop;

varying vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Height in the funnel (dense near the ground).
    float y = -18.0 + 42.0 * pow(r1, 1.5);

    // Funnel radius grows with height; the kick cinches it.
    float rBase = (1.8 + (y + 18.0) * 0.28) * (0.55 + 0.9 * r2);
    float r = rBase * (1.0 - 0.22 * audioKick);

    // Spin: fast at the bottom, music-driven (advance = integrated energy).
    float om  = 2.6 / (0.35 + (y + 18.0) * 0.05);
    float ang = r3 * 6.2831853 + (time * 0.55 + audioAdvance * 1.15) * om;

    // The funnel snakes.
    vec2 sway = vec2(sin(y * 0.09 + time * 0.5), cos(y * 0.07 + time * 0.4))
              * (2.0 + 2.5 * audioLevel);

    vec3 world = vec3(cos(ang) * r + sway.x, y, sin(ang) * r + sway.y);

    // Camera circles the storm at a wary distance.
    float ca  = time * 0.04;
    vec3 cam  = vec3(cos(ca) * 52.0, 6.0, sin(ca) * 52.0);
    vec3 fwd  = normalize(vec3(0.0, 2.0, 0.0) - cam);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - cam;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(95.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 14.0 * px);

    // Dust and debris; a few crackle white on the snare.
    vec3 col = mix(vec3(0.45, 0.38, 0.33), vec3(0.60, 0.58, 0.62), r2);
    col = hueRot(col, audioChromaHue * 0.3);
    if (r4 > 0.93)
        col += vec3(0.8, 0.85, 1.0) * (audioSnare * 2.2 + audioDrop * 1.5);
    col *= (0.5 + 0.9 * audioLevel + 0.8 * audioDrop)
         * (0.45 + 0.55 * pow(1.0 - r1, 0.7))
         * clamp(1.0 - vp.z / 110.0, 0.0, 1.0);
    vCol = vec4(col * 2.7, 1.0);
}
