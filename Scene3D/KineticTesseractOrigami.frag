#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vFoldAngle;

out vec4 fragColor;

/**
 * @file KineticTesseractOrigami.frag
 * @brief Shades one facet of the Miura-ori origami sheet folded by
 * KineticTesseractOrigami.vert: the stored photo blended with an
 * iridescent paper sheen, plus neon crease lines at each facet's border.
 *
 * vFoldAngle (the current fold amount from the vertex stage, itself
 * driven by audioAdvance/audioBass/audioKick) selects the sheen's hue
 * from the house photo palette; audioKick brightens the glowing crease
 * lines and audioSwell lifts overall brightness; audioChromaHue/hueP and
 * audioValence shape the palette's hue drift and saturation via the
 * shared imgPalette helper. glowP scales final output.
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
uniform float foldP;
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
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Origami facet boundary border lines
    vec2 p = abs(vUV - vec2(0.5));
    float edge = step(0.44, max(p.x, p.y));

    // Stored kaleidoscope photo texture
    vec3 photo = img(vUV);

    // Iridescent origami paper sheen
    vec3 paperIrid = imgPalette((vFoldAngle * 4.0 + audioPhase) * 0.159);

    // Glowing crease lines on beat kicks
    vec3 creaseNeon = vec3(1.0, 0.8, 0.2) * edge * (1.0 + audioKick * 3.0);

    vec3 col = mix(photo, paperIrid, 0.3) * (0.8 + 0.4 * audioSwell) + creaseNeon;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * glw, 1.0);
}
