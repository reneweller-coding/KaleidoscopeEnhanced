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

    // Funnel radius grows with height; the kick cinches it, a DROP rips it
    // wide open for a beat.
    float rBase = (1.8 + (y + 18.0) * 0.28) * (0.55 + 0.9 * r2);
    float r = rBase * (1.0 - 0.22 * audioKick) * (1.0 + 0.8 * audioDrop);

    // FLUNG DEBRIS: ~6 % of the particles get hurled out of the funnel on
    // hard kicks — they arc outward and sink back as the envelope decays.
    if (r4 > 0.94)
    {
        float fling = audioKick * (0.5 + 0.5 * sin(r3 * 40.0));
        r += fling * 22.0;
        y += fling * (r2 - 0.3) * 14.0;
    }
    // FORKED LIGHTNING: on the snare, ~3 % of particles snap into a jagged
    // BOLT from the storm ceiling down into the funnel throat — a real
    // visible strike, not just a glow.
    bool isBolt = (r4 > 0.91 && r4 <= 0.94);

    // Spin: fast at the bottom, music-driven (advance = integrated energy).
    float om  = 2.6 / (0.35 + (y + 18.0) * 0.05);
    float ang = r3 * 6.2831853 + (time * 0.55 + audioAdvance * 1.15) * om;

    // The funnel snakes.
    vec2 sway = vec2(sin(y * 0.09 + time * 0.5), cos(y * 0.07 + time * 0.4))
              * (2.0 + 2.5 * audioLevel);

    vec3 world = vec3(cos(ang) * r + sway.x, y, sin(ang) * r + sway.y);

    if (isBolt)
    {
        // Jagged strike path from the storm ceiling into the funnel throat,
        // re-rolled every ~0.8 s (visible only while the snare fires).
        float tB     = r1;                             // 0 top .. 1 strike point
        float strike = floor(time * 1.3);
        float bx     = (fract(sin(strike * 71.3) * 913.7) - 0.5) * 30.0;
        float zig    = (fract(sin(floor(tB * 9.0) * 37.1 + strike) * 517.3) - 0.5)
                     * 7.0 * (1.0 - tB * 0.5);
        world = vec3(bx * (1.0 - tB) + zig
                     + cos(r3 * 6.2831853) * 0.3,
                     26.0 - tB * 40.0,
                     sin(r3 * 6.2831853) * 0.3);
    }

    // Camera circles the storm — and DIVES: the orbit distance and height
    // breathe over ~30 s, from a wary wide shot down into the debris rain.
    float ca  = time * 0.055;
    float orbR = 40.0 + 16.0 * sin(time * 0.033 + 1.0);
    float orbH = 6.0 + 9.0 * sin(time * 0.021);
    vec3 cam  = vec3(cos(ca) * orbR, orbH, sin(ca) * orbR);
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

    // Dust and debris; a few crackle white on the snare.  LIGHTNING: the
    // snare also fires a flash INSIDE the funnel at a wandering height —
    // the whole storm glows from within for an instant.
    vec3 col = mix(vec3(0.45, 0.38, 0.33), vec3(0.60, 0.58, 0.62), r2);
    col = hueRot(col, audioChromaHue * 0.3);
    float flashY = -18.0 + 42.0 * fract(sin(floor(time * 1.3) * 91.7) * 437.585);
    float inner  = exp(-abs(y - flashY) * 0.10) * audioSnare;
    col += vec3(0.75, 0.80, 1.0) * inner * 2.4;
    if (isBolt)
        col = vec3(0.9, 0.95, 1.2) * (audioSnare * 6.0 + audioDrop * 2.0);
    else if (r4 > 0.94)
        col += vec3(0.8, 0.85, 1.0) * (audioSnare * 2.2 + audioDrop * 1.5);
    col *= (0.5 + 0.9 * audioLevel + 0.8 * audioDrop)
         * (0.45 + 0.55 * pow(1.0 - r1, 0.7))
         * clamp(1.0 - vp.z / 110.0, 0.0, 1.0);
    vCol = vec4(col * 2.7, 1.0);
}
