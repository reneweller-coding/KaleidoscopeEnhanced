#version 120
// Phyllotaxis.vert — the sunflower head: 60k florets placed by the golden
// angle (137.5 deg), doming gently in 3D; soft rings of light breathe
// outward with the bar, the whole head turns imperceptibly slowly.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioBarPhase;
uniform float audioSwell;
uniform float audioBass;
uniform float audioChromaHue;

varying vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float n  = attrA.w;                      // floret index
    float r4 = attrB.w;

    const float GA = 2.39996323;             // golden angle in radians
    float th = n * GA + time * 0.02;
    float fr = sqrt(n / 60000.0);            // 0 centre .. 1 rim
    float R  = fr * 24.0 * (1.0 + 0.03 * audioBass);

    // Gentle dome; it breathes with the swell.
    float dome = (1.0 - fr * fr) * (4.0 + 3.0 * audioSwell);

    vec2 p = vec2(cos(th), sin(th)) * R;
    float tilt = 0.65;
    vec3 world = vec3(p.x, p.y * cos(tilt) + dome * 0.7,
                      p.y * sin(tilt));

    vec3 vp = world + vec3(0.0, -3.0, 36.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(120.0 * (0.5 + 0.6 * r4) * px / dist, 1.5, 14.0 * px);

    // A soft ring of light rolls from the centre to the rim once per bar;
    // floret hue winds slowly along the spiral.
    float ring = exp(-abs(fr - audioBarPhase) * 7.0);
    vec3 col = hueRot(vec3(0.95, 0.65, 0.20),
                      audioChromaHue + fr * 1.8);
    col *= (0.40 + 0.50 * r4 + 1.4 * ring)
         * (0.8 + 0.4 * audioSwell);
    vCol = vec4(col * 3.4, 1.0);
}
