#version 330 core
/**
 * @file TorusKnot.vert
 * @brief Vertex stage companion to TorusKnot.frag -- see that file's header for
 * this scene's description.
 */
// TorusKnot.vert — a glowing (2,3) torus knot of 60k particles streaming
// along the curve; the whole knot turns slowly on two axes, the bass
// breathes the tube.  Harmonic and endless — the curve closes on itself.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneSeed;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioBass;
uniform float audioSwell;
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

    // Position along the closed curve; particles FLOW along it.
    float s = r1 * 6.2831853 + time * 0.10 + audioAdvance * 0.22;

    // Knot family rolled per activation: (2,3), (3,4), (2,5) or (3,5).
    float kv = floor(sceneSeed * 3.999);
    float p = (kv < 0.5 || kv > 1.5 && kv < 2.5) ? 2.0 : 3.0;
    float q = (kv < 0.5) ? 3.0 : (kv < 1.5) ? 4.0 : 5.0;
    float R = 11.0, r = 4.2;
    vec3 C = vec3((R + r * cos(q * s)) * cos(p * s),
                  (R + r * cos(q * s)) * sin(p * s),
                  r * sin(q * s));

    // Tube thickness around the curve (cheap frame from neighbours).
    float tube = (0.5 + 1.1 * r2) * (1.0 + 0.35 * audioBass);
    float a2 = r3 * 6.2831853;
    vec3 off = vec3(cos(a2 + s), sin(a2 + s * 0.7), cos(a2 * 1.3 - s)) * tube;
    vec3 world = C + off * 0.5;

    // Slow two-axis tumble.
    float ra = time * 0.07, rb = time * 0.043;
    world.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * world.xz;
    world.yz = mat2(cos(rb), -sin(rb), sin(rb), cos(rb)) * world.yz;

    vec3 vp = world + vec3(0.0, 0.0, 36.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(95.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 14.0 * px);

    // Hue runs along the knot; the flow makes it stream forever.
    vec3 col = hueRot(vec3(0.95, 0.45, 0.25), audioChromaHue + s * 0.8);
    col *= (0.45 + 0.55 * r3) * (0.75 + 0.5 * audioSwell)
         * clamp(1.0 - vp.z / 90.0, 0.0, 1.0);
    vCol = vec4(col * 2.8, 1.0);
}
