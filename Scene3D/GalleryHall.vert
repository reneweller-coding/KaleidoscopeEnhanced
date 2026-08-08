#version 120
// GalleryHall.vert — an endless museum corridor at night: framed pictures
// on both walls, each a different crop of the current image.  The camera
// strolls forward with the music; the picture nearest the camera lights up
// with the beat.  attrA.xy = quad corner, attrA.w = quad index.
//
// Quad budget: index < 300 -> 150 frames per wall side; the rest of the
// 3000 quads become faint ceiling light strips.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioBeatPhase;
uniform float audioSwell;

varying vec2  vUV;
varying vec4  vSeed;
varying float vLight;
varying float vKind;                          // 0 = picture, 1 = light strip

void main()
{
    float idx  = attrA.w;
    float camZ = time * 2.2 + audioAdvance * 9.0;

    vec3  centre;
    vec2  half_;
    float side;

    if (idx < 300.0)
    {
        // Framed pictures: 150 per wall, looping every 12 units.
        side = (mod(idx, 2.0) < 1.0) ? -1.0 : 1.0;
        float slot = floor(idx / 2.0);
        float L    = 150.0 * 12.0;
        float z    = mod(slot * 12.0 - camZ, L) + 2.0;

        centre = vec3(side * 9.0, 1.5, z);
        half_  = vec2(3.4, 2.5);
        vKind  = 0.0;

        // The nearest picture pulses with the beat.
        float near_ = exp(-abs(z - 7.0) * 0.22);
        vLight = 0.65 + 0.55 * near_
               * (0.6 + 0.4 * sin(6.2831853 * audioBeatPhase));
    }
    else if (idx < 600.0)
    {
        // Ceiling light strips every 12 units.
        float slot = idx - 300.0;
        float L    = 300.0 * 12.0;
        float z    = mod(slot * 12.0 - camZ, L) + 2.0;
        centre = vec3(0.0, 7.5, z);
        half_  = vec2(1.4, 0.35);
        side   = 0.0;
        vKind  = 1.0;
        vLight = 0.8 + 0.4 * audioSwell;
    }
    else
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vUV = vec2(0.0); vSeed = attrB; vLight = 0.0; vKind = 1.0;
        return;
    }

    if (centre.z < 1.0 || centre.z > 90.0)    // cull whole quad outside view
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vUV = vec2(0.0); vSeed = attrB;
        return;
    }

    vec2 corner = (attrA.xy - 0.5) * 2.0 * half_;
    // Pictures hang flat on the wall (facing inward); strips face down.
    vec3 vp;
    if (vKind < 0.5)
        vp = centre + vec3(0.0, corner.y, -side * corner.x);
    else
        vp = centre + vec3(corner.x, 0.0, corner.y * 4.0);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV   = attrA.xy;
    vSeed = attrB;
}
