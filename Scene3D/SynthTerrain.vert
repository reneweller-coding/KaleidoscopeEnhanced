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
uniform float audioKick;
uniform float audioDrop;
uniform float audioBeatPhase;

varying vec3  vWorld;    // x, zAbs, height (for the fragment grid lines)
varying float vDist;

void main()
{
    float u = attrA.x, v = attrA.y;

    float camZ = time * 7.0 + audioAdvance * 16.0;
    float x    = (u - 0.5) * 180.0;
    float zRel = v * 260.0 + 2.0;
    float zAbs = zRel + camZ;

    // Valley profile: flat corridor, MASSIVE ridges toward the sides — the
    // ridge height rides the spectrum band of its |x| position.  Structure
    // frequencies are LOW (big smooth mountains); the old high-frequency
    // micro-noise term is gone — it aliased against the grid and read as
    // pixelated trembling.
    float base = pow(abs(x) / 90.0, 1.6) * 40.0;
    float wave = 0.55 + 0.45 * sin(zAbs * 0.028 + x * 0.04)
                             * sin(zAbs * 0.013 - x * 0.027);
    int   band = int(clamp(abs(x) / 90.0 * 31.0, 0.0, 31.0));
    float h    = base * wave * (1.0 + 0.9 * audioSpectrum[band])
               * (1.0 + 0.15 * audioSwell);

    // KICK QUAKE: every kick rolls a ground shockwave down the valley
    // toward the camera; a DROP ruptures the whole terrain upward once.
    float qz = fract(zAbs * 0.012 - audioBeatPhase);
    h += 3.5 * audioKick * exp(-qz * 9.0) * (0.3 + 0.7 * abs(sin(x * 0.15)));
    h += 6.0 * audioDrop * exp(-abs(x) * 0.04) * sin(zAbs * 0.10);

    // CAMERA: banking low-level flight — swings across the valley and rolls
    // into the turns instead of gliding straight down the middle.
    float swing = sin(time * 0.11) * 18.0;
    float roll  = -cos(time * 0.11) * 0.14;
    vec3 vp = vec3(x - swing, h - 6.0 + sin(time * 0.23) * 1.5, zRel);
    vp.xy = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * vp.xy;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vWorld = vec3(x, zAbs, h);
    vDist  = zRel;
}
