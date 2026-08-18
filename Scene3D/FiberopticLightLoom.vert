#version 330 core
/**
 * @file FiberopticLightLoom.vert
 * @brief Vertex stage companion to FiberopticLightLoom.frag -- see that file's header for
 * this scene's description.
 */
// FiberopticLightLoom.vert — 20 woven fiberoptic ribbons flowing in 3D
// warp-and-weft patterns transmitting high-speed data pulse packets.
//   attrA.x = t along ribbon, attrA.y = side (-1/+1), attrA.w = ribbon index
//   attrB   = per-ribbon seeds

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioHigh;

uniform float weaveP;
uniform float densityP;
uniform float widthP;
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

out vec4  vCol;
out float vSide;
out float vLength;

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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float t    = attrA.x; // 0..1 along ribbon
    float side = attrA.y; // -1..+1
    float ri   = attrA.w; // 0..19

    float wv  = (weaveP   > 0.0) ? weaveP   : 1.0;
    float den = (densityP > 0.0) ? densityP : 1.0;
    float wid = (widthP   > 0.0) ? widthP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    const float L = 160.0;
    float camZ = time * 7.5 + audioAdvance * 15.0;
    float zRel = t * L;
    float zAbs = zRel + camZ;

    // Loom coordinate: ribbons split into warp (horizontal) and weft (vertical)
    float isWarp = (mod(ri, 2.0) < 1.0) ? 1.0 : -1.0;
    float lane = (ri - 10.0) * 0.9 * den;

    // Harmonic 3D weave undulation
    float weaveOffset = sin(zAbs * 0.08 * wv + lane * 1.5) * isWarp * 1.6;
    float kickUndulate = sin(zAbs * 0.12 - time * 6.0) * audioKick * 1.4;

    vec3 centerPos = vec3(
        (isWarp > 0.0) ? lane * 1.5 : weaveOffset * 1.5,
        (isWarp < 0.0) ? lane * 1.5 : weaveOffset * 1.5 + kickUndulate,
        zRel
    );

    vec3 tangentDir = (isWarp > 0.0) ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    float ribbonWidth = (0.35 * wid) * (1.0 + 0.3 * audioKick);
    vec3 worldP = centerPos + tangentDir * (side * ribbonWidth);

    // Camera space
    vec3 camPos = vec3(0.0, 0.0, 0.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vSide = side;
    vLength = t;

    // Optical pulse packet
    float pulse = fract(zAbs * 0.06 - time * 4.5 - ri * 0.1);
    float pulseGlow = exp(-pulse * 6.0) * 2.5;

    // Fiberoptic cyan, violet, neon gold palette
    vec3 col = imgPalette((ri * 0.5 + time) * 0.159) * 1.5;
    col = mix(col, vec3(1.0, 0.9, 0.2), pulseGlow * 0.5);

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (1.0 + pulseGlow + audioHigh * 0.8), 1.0);
}
