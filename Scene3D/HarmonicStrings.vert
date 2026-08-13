#version 330 core
// HarmonicStrings.vert — a giant invisible harp: 20 strings stretched
// through space, each ringing as a standing wave in its own mode; the
// string's spectrum band feeds its amplitude smoothly.  Pure, steady.
// attrA.x = along the string, attrA.y = side, attrA.w = string index.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioChromaHue;

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
    float t  = attrA.x;
    float sd = attrA.y;
    float si = attrA.w;                      // string 0..19
    float r1 = attrB.x;

    int   band = int(mod(si * 1.6, 32.0));
    float lvl  = audioSpectrum[band];

    // Strings fan gently through depth, low strings in front.
    float x = (t - 0.5) * 60.0;
    float y = (si - 9.5) * 2.3;
    float z = 30.0 + si * 1.8;

    // Standing wave: mode number rises with the string; amplitude follows
    // the band with a slow envelope so it RINGS instead of jittering.
    float mode = 1.0 + mod(si, 5.0);
    float freq = 1.4 + mode * 0.5;
    float a = sin(t * 3.14159265 * mode)
            * cos(time * freq + r1 * 6.2831853)
            * (0.25 + 3.6 * lvl) * (0.7 + 0.6 * audioSwell);
    y += a + sd * 0.32;                      // sd = string thickness

    vec3 vp = vec3(x, y, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // String colour by register: warm bass strings, silvery trebles.
    vec3 col = hueRot(mix(vec3(1.0, 0.55, 0.20), vec3(0.55, 0.75, 1.0),
                          si / 19.0),
                      audioChromaHue * 0.7);
    col *= 0.50 + 2.0 * lvl + 0.30 * audioSwell;

    vCol  = vec4(col * 1.4, 1.0);
    vSide = sd;
}
