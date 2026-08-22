#version 330 core
in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in float vHeight;

out vec4 fragColor;

/**
 * @file CyberVoxelTerraform.frag
 * @brief Lighting for a voxel landscape projected with a slideshow photo:
 * diffuse-lit cube terrain blended with the photo texture, coloured by
 * elevation (vHeight) via the house photo-palette, with glowing neon rim
 * lines on each voxel's top face.
 *
 * audioKick brightens the neon top-face rim, and the photo-palette itself
 * (imgPalette) follows the musical key through audioChromaHue and
 * audioAdvance with saturation shaped by audioValence; hueP applies an
 * additional preset hue rotation to the final colour.
 */

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float glowP;
uniform float neonP;
uniform float hueP;
uniform float audioChromaHue;
uniform float audioValence;

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
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float neo = (neonP > 0.0) ? neonP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Diffuse directional lighting
    vec3 lightDir = normalize(vec3(0.6, 1.0, -0.4));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.7 + 0.3;

    // Projected photo mapping across voxel landscape
    vec3 photo = img(vUV);

    // Cyber voxel elevation color gradient
    vec3 heightColor = imgPalette(0.35 * clamp(vHeight / 2.5, 0.0, 1.0)) * (0.4 + 0.9 * clamp(vHeight / 2.5, 0.0, 1.0));
    heightColor = mix(heightColor, vec3(1.0, 0.2, 0.8), clamp((vHeight - 1.5) / 1.5, 0.0, 1.0));

    // Glowing neon voxel top face edge lines
    float topFace = step(0.8, vNormal.y);
    vec3 neonRim = imgPalette(0.45 + 0.30 * topFace) * 1.5 * neo * (0.8 + audioKick * 2.0);

    vec3 col = mix(photo, heightColor, 0.45) * diff;
    col += neonRim * topFace * (0.6 + 0.4 * vHeight);

    if (hue > 0.001) col = hueRot(col, hue);

    col *= 3.20;   // measured-dark lift (visual pass)
    fragColor = vec4(col * glw, 1.0);
}
