#version 120
// CubeWave.vert — an endless neon-city flythrough of REAL cubes.
// A 70x70 field of depth-tested cubes repeats forever along the flight path;
// each column's height rides one of the 32 spectrum bands (the whole city IS
// the equalizer), kicks flash the street level, drops light everything up.
//   attrA.xyz = unit-cube corner (-0.5..0.5), attrA.w = cube index
//   attrB     = per-cube seeds
// True stereo: eyeOff shifts the view; convergence re-centres after proj.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioCentroid;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioDrop;

varying vec4 vCol;
varying vec3 vCorner;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float i    = attrA.w;
    float gx   = mod(i, 70.0) - 34.5;               // column across
    float gz   = floor(i / 70.0);                   // row along the flight
    float seed = attrB.x;

    // The row field repeats forever along the flight direction.
    const float spacing = 3.0;
    const float fieldL  = 70.0 * spacing;
    float camZ = time * 4.0 + audioAdvance * 9.0;
    float z    = mod(gz * spacing - camZ, fieldL);  // 0..210 ahead

    // Column height = its spectrum band (smoothed host-side) + seed variety.
    int   band = int(clamp(abs(gx) / 34.5 * 31.0, 0.0, 31.0));
    float h    = (0.6 + attrB.y * 1.6)
               * (1.0 + 14.0 * audioSpectrum[band])
               * (1.0 + 0.25 * audioSwell);

    // Street-level kick flash lifts the near columns a touch.
    float lift = 0.5 * audioKick * exp(-abs(gx) * 0.10);

    vec3 world;
    world.x = gx * spacing + sin(time * 0.11) * 0.0;
    world.y = attrA.y * h + h * 0.5 + lift - 6.0;
    world.z = z;
    world.x += attrA.x * (1.4 + 0.8 * attrB.z);     // cube footprint
    world.z += attrA.z * (1.4 + 0.8 * attrB.w);

    // Camera: fixed height, gentle sway; looks straight down the street.
    vec3 vp = vec3(world.x - sin(time * 0.11) * 4.0, world.y, world.z);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Colour: height + centroid temperature, key-hue drift; distance fog.
    float hNorm = clamp(h / 16.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.15, 0.5, 1.0), vec3(1.0, 0.35, 0.65), hNorm);
    col = mix(col, vec3(1.0, 0.8, 0.3), audioCentroid * 0.4);
    col = hueRot(col, audioChromaHue * 1.2 + seed * 0.8);
    col *= 0.8 + 1.2 * audioDrop + 0.8 * audioKick * exp(-abs(gx) * 0.10);
    float fog = exp(-z * 0.014);
    vCol    = vec4(col * fog, 1.0);
    vCorner = attrA.xyz;
}
