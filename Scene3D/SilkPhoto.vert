#version 330 core
// SilkPhoto.vert — the current image on a huge silk banner rippling in an
// audio-driven wind.  The cloth hangs from its top edge; the music is the
// wind, kicks slap a radial ripple through the fabric.
// attrA.x = across the banner, attrA.y = down the banner.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioLevel;
uniform float audioSwell;
uniform float audioKick;
uniform float audioBass;

out vec2  vUV;
out float vShade;

void main()
{
    float u = attrA.x, w = attrA.y;

    // Banner 44 x 28, hanging ahead of the camera.
    vec3 p = vec3((u - 0.5) * 44.0, (0.5 - w) * 28.0 + 2.0, 36.0);

    // Wind: two travelling waves; amplitude grows toward the free bottom
    // edge (top edge is fixed) and with the music's energy.
    float wind = 0.35 + 0.9 * audioLevel + 0.7 * audioSwell;
    float ph1  = u * 7.0  + time * 1.9;
    float ph2  = u * 11.0 - w * 5.0 + time * 2.7;
    float sway = sin(ph1) * 1.8 + sin(ph2) * 0.9;

    // Kick ripple expanding from the banner centre.
    float d      = length(vec2(u - 0.5, w - 0.5));
    float ripple = sin(d * 40.0 - time * 9.0) * exp(-d * 4.0) * audioKick * 1.4;

    float amp = (0.25 + 0.75 * w) * wind;
    p.z += (sway + ripple) * amp + sin(w * 6.0 + time * 1.1) * 0.6 * audioBass;

    vec3 vp = p;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV = vec2(u, w);

    // Cheap cloth shading from the wave slope (folds catch the light).
    float slope = cos(ph1) * 1.8 * 7.0 + cos(ph2) * 0.9 * 11.0;
    vShade = clamp(0.75 + slope * 0.035 * amp, 0.35, 1.45);
}
