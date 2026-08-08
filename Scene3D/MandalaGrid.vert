#version 120
// MandalaGrid.vert — a breathing mandala disc floating in space: the grid
// becomes a circular membrane whose surface carries slow radial standing
// waves; the fragment shader paints an 8-fold symmetric colour rosette.
// attrA.x = angle, attrA.y = radius.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;
uniform float audioAdvance;

varying vec2  vPolar;                        // angle, radius 0..1
varying float vLift;

void main()
{
    float u = attrA.x;                       // angle 0..1
    float w = attrA.y;                       // radius 0..1

    float ang = u * 6.2831853;
    float R   = w * 26.0;

    // Radial standing waves + a gentle m=6 angular mode; all slow.
    float ph = time * 0.5 + audioAdvance * 0.4;
    float h = sin(w * 14.0 - ph)            * (0.8 + 1.8 * audioBass)
            + sin(w * 6.0 + ph * 0.6)       * 0.7
            + sin(ang * 6.0 + ph * 0.35)    * 0.5 * w;
    h *= (0.6 + 0.6 * audioSwell) * (1.0 - w * 0.5);

    // Tilted toward the camera like an altar disc.
    float tilt = 0.55;
    vec2 p = vec2(cos(ang), sin(ang)) * R;
    vec3 vp = vec3(p.x,
                   (p.y + 4.0) * cos(tilt) + h - 4.0,
                   (p.y + 4.0) * sin(tilt) + 36.0 - h * 0.4);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vPolar = vec2(ang, w);
    vLift  = h;
}
