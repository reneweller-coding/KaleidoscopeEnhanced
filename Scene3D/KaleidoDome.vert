#version 120
// KaleidoDome.vert — INSIDE a planetarium dome fully covered with a living
// kaleidoscope rosette of the current image.  The dome section always faces
// the camera (no tearing); all rotation happens in texture space.
// attrA.x = azimuth 0..1, attrA.y = elevation 0..1.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;

varying vec2  vUV;
varying float vR;

void main()
{
    // Dome section: +-75 deg azimuth, +-63 deg elevation ahead of the camera.
    float az = (attrA.x - 0.5) * 2.62;
    float el = (attrA.y - 0.5) * 2.20;

    float R = 40.0 * (1.0 + 0.04 * audioBass);
    vec3 vp = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el)) * R;

    // Gentle observer sway so the dome feels physical.
    vp.x += 1.5 * sin(time * 0.21);
    vp.y += 1.0 * sin(time * 0.17 + 1.0);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Polar coordinates on the dome for the rosette (0 = view centre).
    vUV = vec2(az, el);
    vR  = length(vec2(az, el));
}
