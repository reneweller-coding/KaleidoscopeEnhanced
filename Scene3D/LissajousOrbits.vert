#version 330 core
// LissajousOrbits.vert — six particle streams trace closed 3D Lissajous
// figures whose phase relation drifts imperceptibly, so the figures morph
// through their whole family over minutes.  Classic scope art, floating.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
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

    float stream = mod(attrA.w, 6.0);

    // Frequency ratios per stream (small integers -> closed curves).
    float fa = 1.0 + mod(stream, 3.0);           // 1,2,3
    float fb = 2.0 + mod(stream * 1.7, 3.0);     // 2,3,4
    float fc = 3.0 + mod(stream * 2.3, 2.0);     // 3,4

    // Particles stream along the curve; the phase relation drifts slowly.
    float s     = r1 * 6.2831853 + time * 0.12 + audioAdvance * 0.2;
    float drift = time * 0.015;

    float A = (13.0 + stream * 1.2) * (1.0 + 0.05 * audioBass);
    vec3 world = vec3(sin(fa * s + drift) * A,
                      sin(fb * s + drift * 1.6) * A * 0.62,
                      sin(fc * s + drift * 0.7) * A * 0.5);

    // Soft tube spread.
    world += (vec3(r2, r3, r4) - 0.5) * 1.0;

    float ra = time * 0.05;
    world.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * world.xz;

    vec3 vp = world + vec3(0.0, 0.0, 40.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(90.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 13.0 * px);

    vec3 col = hueRot(vec3(0.35, 0.85, 0.60),
                      audioChromaHue + stream * 1.05);
    col *= (0.4 + 0.6 * r3) * (0.7 + 0.5 * audioSwell)
         * clamp(1.0 - vp.z / 95.0, 0.0, 1.0);
    vCol = vec4(col * 2.7, 1.0);
}
