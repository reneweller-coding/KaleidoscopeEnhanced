#version 120
// EchoSpiral.vert — the beloved MilkDrop infinite zoom, done honestly in
// 3D: a logarithmic spiral is SELF-SIMILAR, so a slow continuous zoom that
// loops one turn is perfectly seamless.  20 ribbons = 20 turns; hue flows
// outward forever.  attrA.x = along the turn, attrA.y = side, attrA.w = turn.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;

varying vec4  vCol;
varying float vSide;

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
    float ti = attrA.w;                      // turn index 0..19

    const float b = 0.16;                    // spiral tightness

    // Seamless zoom: phase runs 0..1 per turn; each ribbon slides one turn
    // inward and wraps to the outside — self-similarity hides the seam.
    float zoomPh = fract(time * 0.045 + audioAdvance * 0.05);
    float turn   = mod(ti + zoomPh, 20.0);

    float theta = (turn + t) * 6.2831853;
    float R = 0.55 * exp(b * theta * 0.15921);   // e^(b*theta/(2pi))*turns

    // Slow rotation + a gentle bass breath.
    float rot = time * 0.10 + audioAdvance * 0.15;
    R *= 1.0 + 0.04 * audioBass;

    // sd widens the band radially (wider toward the rim, like a groove) —
    // narrow enough that the turns stay clearly separated.
    vec2 p = vec2(cos(theta + rot), sin(theta + rot))
           * (R + sd * (0.14 + R * 0.045));

    // Tilted plane so the spiral recedes into depth.
    float tilt = 0.85;
    vec3 vp = vec3(p.x,
                   p.y * cos(tilt) - 1.0,
                   p.y * sin(tilt) + 34.0);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Hue advances with the zoom so colour appears to well up from the
    // centre; edges of the ribbon soften in the frag.
    vec3 col = hueRot(vec3(0.9, 0.4, 0.65),
                      audioChromaHue + turn * 0.35 - zoomPh * 0.35);
    col *= (0.9 + 0.5 * audioSwell)
         * smoothstep(0.0, 1.5, R)                 // fade the tiny centre
         * (1.0 - smoothstep(14.0, 26.0, R));      // and the far rim

    vCol  = vec4(col * 1.1, 1.0);
    vSide = sd;
}
