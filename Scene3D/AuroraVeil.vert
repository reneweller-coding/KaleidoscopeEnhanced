#version 330 core
/**
 * @file AuroraVeil.vert
 * @brief Vertex stage companion to AuroraVeil.frag -- see that file's header for
 * this scene's description.
 */
// AuroraVeil.vert — true 3D aurora curtains: each ribbon is a tall veil
// hanging in the night sky, slowly folding on itself; the swell drives the
// wave amplitude, everything drifts, nothing jumps.
// attrA.x = along the curtain, attrA.y = vertical extent, attrA.w = veil.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;

out vec4  vCol;
out float vSide;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float t  = attrA.x;                      // along the curtain
    float sd = attrA.y;                      // -1 bottom .. +1 top
    float vi = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z;

    // Each veil is a slow serpentine line across the sky; veils spread
    // well apart in x and depth so they never pile up into a white wall.
    float amp = (3.0 + 5.0 * r2) * (0.6 + 0.9 * audioSwell);
    float ph  = time * (0.10 + 0.06 * r3) + audioAdvance * 0.15;
    float x   = (t - 0.5) * 65.0 + (r1 - 0.5) * 85.0;
    float z   = 30.0 + vi * 4.5
              + sin(t * 4.0 + ph * 3.0 + r1 * 9.0) * amp
              + sin(t * 9.0 - ph * 2.0 + r2 * 7.0) * amp * 0.4;

    // Curtain hangs from ~high sky down; lower edge shimmers a little.
    float top = 26.0 + 6.0 * r3;
    float y   = 6.0 + sd * 0.5 * top + top * 0.5;
    x += sin(y * 0.10 + ph * 2.0) * 2.0 * (0.5 - 0.5 * sd);

    vec3 vp = vec3(x, y - 8.0, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Aurora gradient: green skirts to violet crowns, keyed to the music.
    vec3 low  = vec3(0.10, 0.85, 0.35);
    vec3 high = vec3(0.45, 0.20, 0.80);
    vec3 col  = hueRot(mix(low, high, sd * 0.5 + 0.5),
                       audioChromaHue * 0.5);
    col *= (0.5 + 0.5 * audioLevel + 0.5 * audioSwell)
         * (0.55 + 0.45 * sin(t * 17.0 + ph * 5.0));   // slow ray structure

    vCol  = vec4(col * 0.40, 1.0);
    vSide = sd;
}
