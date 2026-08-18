#version 330 core
/**
 * @file PlasmaSheet.vert
 * @brief Vertex stage companion to PlasmaSheet.frag -- see that file's header for
 * this scene's description.
 */
// PlasmaSheet.vert — a great silk sheet of plasma hanging in space,
// rippling with two slow interference trains; the classic MilkDrop plasma
// lives in the fragment shader.  attrA.x/.y span the sheet.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;
uniform float audioAdvance;

out vec2  vUV;
out float vH;

void main()
{
    float u = attrA.x, w = attrA.y;

    float x = (u - 0.5) * 70.0;
    float y = (w - 0.5) * 40.0;

    float ph = time * 0.55 + audioAdvance * 0.5;
    float h = sin(x * 0.14 + y * 0.09 + ph)        * 2.0
            + sin(x * 0.07 - y * 0.15 + ph * 0.7)  * 2.6;
    h *= (0.5 + 0.9 * audioBass + 0.4 * audioSwell);

    // Sheet leans back gently like a projection canvas.
    float tilt = 0.35;
    vec3 vp = vec3(x,
                   y * cos(tilt) + h * 0.8,
                   y * sin(tilt) + 42.0 + h * 0.4);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV = vec2(u, w);
    vH  = h;
}
