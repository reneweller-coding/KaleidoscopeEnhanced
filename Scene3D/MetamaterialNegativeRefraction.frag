#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;
in float vPhaseVelocity;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float nP;
uniform float lensP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
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

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping onto metamaterial grid
    vec3 photo = img(vTexCoord);

    // Negative refraction: the two media take their tints from the photo
    // palette a half-turn apart, so they always contrast but never candy.
    vec3 positiveCol = imgPalette(0.10) * 1.25;
    vec3 negativeCol = imgPalette(0.60) * 1.25;
    vec3 metaColor = (vPhaseVelocity > 0.0) ? positiveCol : negativeCol;

    // Superlens focal spot: a spot IN the slab plane (xz), kick-pulsed
    float focusGlow = exp(-length(vWorldPos.xz) * 2.2) * (0.7 + audioKick * 0.6);

    vec3 col = mix(photo, metaColor, 0.45);
    col += focusGlow * imgPalette(0.35) * 1.6;

    if (hue > 0.001) col = hueRot(col, hue);

    col /= 1.0 + 0.32 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
