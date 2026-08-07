#version 120
// SynthTerrain.vert — a synthwave wireframe terrain flythrough: the camera
// glides down a valley between mountain ridges whose heights ride the 32
// spectrum bands.  The grid mesh (attrA.xy = u/v) is displaced here; the
// fragment shader draws the glowing grid lines.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;

varying vec3  vWorld;    // x, zAbs, height (for the fragment grid lines)
varying float vDist;

void main()
{
    float u = attrA.x, v = attrA.y;

    float camZ = time * 7.0 + audioAdvance * 16.0;
    float x    = (u - 0.5) * 180.0;
    float zRel = v * 260.0 + 2.0;
    float zAbs = zRel + camZ;

    // Valley profile: flat corridor, ridges rising toward the sides — the
    // ridge height rides the spectrum band of its |x| position.
    float base = pow(abs(x) / 90.0, 1.6) * 26.0;
    float wave = 0.55 + 0.45 * sin(zAbs * 0.045 + x * 0.06)
                             * sin(zAbs * 0.021 - x * 0.043);
    int   band = int(clamp(abs(x) / 90.0 * 31.0, 0.0, 31.0));
    float h    = base * wave * (1.0 + 0.9 * audioSpectrum[band])
               * (1.0 + 0.15 * audioSwell);
    h += 0.8 * sin(zAbs * 0.35 + attrB.x) * sin(x * 0.4);

    vec3 vp = vec3(x - sin(time * 0.09) * 5.0, h - 7.0, zRel);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vWorld = vec3(x, zAbs, h);
    vDist  = zRel;
}
