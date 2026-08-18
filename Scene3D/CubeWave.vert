#version 330 core
/**
 * @file CubeWave.vert
 * @brief Vertex stage companion to CubeWave.frag -- see that file's header for
 * this scene's description.
 */
// CubeWave.vert — an endless neon-city flythrough of REAL cubes.
// A 70x70 field of depth-tested cubes repeats forever along the flight path;
// each column's height rides one of the 32 spectrum bands (the whole city IS
// the equalizer), kicks flash the street level, drops light everything up.
//   attrA.xyz = unit-cube corner (-0.5..0.5), attrA.w = cube index
//   attrB     = per-cube seeds
// True stereo: eyeOff shifts the view; convergence re-centres after proj.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float cubeBudget;    // FPS detail budget: <1 -> drop every 2nd cube

uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioCentroid;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioDrop;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

out vec4 vCol;
out vec3 vCorner;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float i    = attrA.w;

    // FPS budget: below full detail, every 2nd cube collapses (checkerboard
    // over the field so no visible hole appears).
    if (cubeBudget < 0.75 && mod(i, 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    float gx   = mod(i, 70.0) - 34.5;               // column across
    float gz   = floor(i / 70.0);                   // row along the flight
    float seed = attrB.x;

    // A free STREET runs down the middle — the camera flies over it, so no
    // tower can ever sit in (or pop up in front of) the lens.
    if (abs(gx) < 2.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    // The row field repeats forever along the flight direction.
    const float spacing = 3.0;
    const float fieldL  = 70.0 * spacing;
    float camZ = time * 10.0 + audioAdvance * 18.0;   // a real flight speed
    float z    = mod(gz * spacing - camZ, fieldL);  // 0..210 ahead

    // NEAR FADE: towers shrink away before they reach the camera plane
    // (recycled cubes used to pop up huge right in front of the lens).
    float nearFade = smoothstep(2.0, 16.0, z);

    // Column height = its spectrum band, bass at the street edges.
    int   band = int(clamp((abs(gx) - 2.5) / 32.0 * 31.0, 0.0, 31.0));
    float h    = (0.6 + attrB.y * 1.6)
               * (1.0 + 14.0 * audioSpectrum[band])
               * (1.0 + 0.25 * audioSwell) * nearFade;

    // Street-level kick flash lifts the near columns a touch.
    float lift = 0.5 * audioKick * exp(-abs(gx) * 0.10);

    vec3 world;
    world.x = gx * spacing;
    world.y = attrA.y * h + h * 0.5 + lift - 7.5;
    world.z = z;
    world.x += attrA.x * (1.4 + 0.8 * attrB.z) * nearFade;   // cube footprint
    world.z += attrA.z * (1.4 + 0.8 * attrB.w) * nearFade;

    // Camera: flies ABOVE the street with a gentle downward pitch (city
    // overview instead of eye-level wall), light lateral sway.
    vec3 vp = vec3(world.x - sin(time * 0.11) * 4.0, world.y, world.z);
    float pitch = 0.14;
    float cp = cos(pitch), sp2 = sin(pitch);
    vp.yz = vec2(vp.y * cp + vp.z * sp2,
                 vp.z * cp - vp.y * sp2);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Colour: height + centroid temperature, key-hue drift; distance fog.
    float hNorm = clamp(h / 16.0, 0.0, 1.0);
    vec3 col = imgPalette(0.30 * hNorm) * 1.4;
    col = mix(col, vec3(1.0, 0.8, 0.3), audioCentroid * 0.4);
    col = hueRot(col, seed * 0.8);
    col *= 0.8 + 1.2 * audioDrop + 0.8 * audioKick * exp(-abs(gx) * 0.10);
    float fog = exp(-z * 0.014);
    vCol    = vec4(col * fog, 1.0);
    vCorner = attrA.xyz;
}
