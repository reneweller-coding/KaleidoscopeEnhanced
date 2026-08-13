#version 330 core
// SnowDrift.vert — slow snowfall through a blue night; every flake sways
// on its own pendulum, a faint ground glow catches them as they land.
// The music only leans on the wind and the sparkle — never shakes it.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

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

    // Fall forever (looped column), each flake at its own speed.
    const float H = 60.0;
    float speed = 1.4 + 2.2 * r4;
    float y = 28.0 - mod(r2 * H + time * speed, H);

    // Pendulum sway + a slow wind field that leans with the music.
    float sway = sin(time * (0.7 + r3 * 0.8) + r1 * 40.0)
               * (0.8 + 1.4 * r3);
    float wind = sin(time * 0.11) * (2.0 + 4.0 * audioSwell);
    vec3 world = vec3((r1 - 0.5) * 120.0 + sway + wind * (28.0 - y) * 0.02,
                      y,
                      8.0 + r3 * 80.0);

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(115.0 * (0.35 + 0.75 * r4) * px / dist,
                         1.5, 13.0 * px);

    // Cold moonlit white with the faintest key tint; flakes glint gently
    // as they tumble; a soft glow near the ground plane.
    float glint  = 0.7 + 0.3 * sin(time * (1.3 + r2 * 2.0) + r1 * 30.0);
    float ground = exp(-abs(y + 26.0) * 0.12) * 0.8;
    vec3 col = hueRot(vec3(0.80, 0.86, 1.0), audioChromaHue * 0.15);
    col *= (0.30 + 0.35 * r4) * glint
         * (0.7 + 0.35 * audioSwell + 0.2 * audioLevel)
         * (1.0 + ground)
         * clamp(1.0 - vp.z / 100.0, 0.0, 1.0);
    vCol = vec4(col * 3.2, 1.0);
}
