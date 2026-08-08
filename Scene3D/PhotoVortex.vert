#version 120
// PhotoVortex.vert — the current image spirals down a whirlpool funnel;
// kicks make the vortex gulp, the music's advance drives the swirl.
// attrA.x = angle around the funnel, attrA.y = radius (0 = throat).

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;

varying vec2  vUV;
varying float vDepth;

void main()
{
    float u = attrA.x, w = attrA.y;

    float r = mix(1.6, 38.0, pow(w, 1.35));

    // Inner rings spin much faster (whirlpool shear).
    float swirl = (time * 0.35 + audioAdvance * 0.9) * pow(1.0 - w, 1.6) * 6.0;
    float ang   = u * 6.2831853 + swirl;

    // Funnel depth; the kick gulp briefly deepens the throat.
    float depth = -15.0 * pow(1.0 - w, 2.2)
                * (1.0 + 0.35 * audioKick + 0.15 * audioBass);

    vec3 world = vec3(cos(ang) * r, depth - 2.5, sin(ang) * r);

    // Fixed camera above the rim looking down into the funnel.
    vec3 p  = world - vec3(0.0, 9.0, -30.0);
    float pitch = -0.42;
    vec3 vp = vec3(p.x,
                   p.y * cos(pitch) - p.z * sin(pitch),
                   p.y * sin(pitch) + p.z * cos(pitch));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    vUV   = vec2(u, w);
    vDepth = 1.0 - w;                       // 1 at the throat
}
