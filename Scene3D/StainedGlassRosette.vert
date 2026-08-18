#version 330 core
/**
 * @file StainedGlassRosette.vert
 * @brief Vertex stage companion to StainedGlassRosette.frag -- see that file's header for
 * this scene's description.
 */
// StainedGlassRosette.vert — a great cathedral rose window fills the view:
// a flat polar disc facing the camera, slowly turning, lit from behind by
// a light that pulses with the swell.  The glass mosaic + lead lines + god
// rays all live in the fragment shader.  attrA.x = angle, attrA.y = radius.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioSwell;

out vec2  vPolar;      // angle, radius 0..1
out vec2  vXY;         // cartesian, for the fragment's own polar re-map

void main()
{
    float u = attrA.x;                       // angle 0..1
    float w = attrA.y;                       // radius 0..1

    float ang = u * 6.2831853 + time * 0.025 + audioAdvance * 0.03;
    float R = w * 24.0 * (1.0 + 0.02 * audioSwell);

    vec2 xy = vec2(cos(ang), sin(ang)) * R;
    vec3 world = vec3(xy.x, xy.y, 0.0);

    vec3 vp = world + vec3(0.0, 2.0, 40.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vPolar = vec2(ang, w);
    vXY    = xy;
}
