#version 330 core
// RoseOrbit.vert — a rose curve (r = cos(k*theta)) drawn by orbiting
// particle streams on a tilted plane, petals slowly precessing; a second
// faint rose spins counterwise behind it.  Spirograph serenity.

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

    // Two layers: front rose (k=5) and a slower back rose (k=7).
    bool back = r1 > 0.72;
    float k   = back ? 3.5 : 2.5;            // k = n/2 -> closed curves
    float spin = back ? -0.05 : 0.08;

    // theta runs twice around for closure; particles stream along it.
    float th = r2 * 12.5663706 + time * (back ? 0.06 : 0.09)
             + audioAdvance * 0.15;
    float R  = (back ? 22.0 : 15.0) * abs(cos(k * th))
             * (1.0 + 0.05 * audioBass);

    float rot = time * spin;
    vec2 p = vec2(cos(th + rot), sin(th + rot)) * R;

    // Thicken the line into a soft tube of particles.
    p += vec2(r3 - 0.5, r4 - 0.5) * 1.1;

    float tilt = 0.75;
    // 3-AXIS SPIN (user feedback): the rose turns around all of its axes
    float rx = tilt + time * 0.17;
    float ry = time * 0.23 + audioAdvance * 0.08;
    float rz = time * 0.11;
    vec3 q = vec3(p, 0.0);
    q.xz = mat2(cos(ry), -sin(ry), sin(ry), cos(ry)) * q.xz;
    q.yz = mat2(cos(rx), -sin(rx), sin(rx), cos(rx)) * q.yz;
    q.xy = mat2(cos(rz), -sin(rz), sin(rz), cos(rz)) * q.xy;
    vec3 vp = q + vec3(0.0, 0.0, (back ? 46.0 : 38.0));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(90.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 13.0 * px);

    // Petal hue turns with position; back rose cooler and fainter.
    vec3 col = back ? vec3(0.30, 0.45, 0.85) : vec3(0.95, 0.35, 0.55);
    col = hueRot(col, audioChromaHue + th * 0.12);
    col *= (back ? 0.35 : 0.75) * (0.75 + 0.5 * audioSwell)
         * (0.5 + 0.5 * r3);
    vCol = vec4(col * 2.6, 1.0);
}
