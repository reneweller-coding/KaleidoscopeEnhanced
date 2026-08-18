#version 330 core
out vec4 fragColor;
// OceanAbyssalBrinePool.frag
// -----------------------------------------------------------------------
// OCEAN ABYSSAL BRINE POOL: a deep-sea brine basin seen from above, the
// camera slowly ORBITING the pool; hypersaline internal waves shimmer in
// photo-palette colours against the abyssal blue shore.
//   audioKick -> halocline shimmer    audioBass -> internal waves
//   audioAdvance -> orbit
// -----------------------------------------------------------------------

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;

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

uniform float brineP;
uniform float haloclineP;
uniform float speedP;
uniform float hueP;
uniform float time;

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

    // Photo texture mapping onto deep-sea water surface
    vec3 photo = img(vTexCoord);

    // Deep abyssal water with the brine pool glowing in photo colours
    vec3 deepWater = vec3(0.01, 0.1, 0.25);
    vec3 brineGlow = imgPalette(0.12) * 1.3;
    vec3 haloclineRefract = imgPalette(0.55) * 1.2;

    float r = length(vWorldPos.xz);
    float isBrine = smoothstep(1.8, 0.6, r);

    // Halocline shimmering waves
    float shimmer = pow(abs(sin(vTexCoord.x * 25.0 + vTexCoord.y * 25.0 + time * 3.0)), 6.0);

    vec3 waterCol = mix(deepWater, brineGlow, isBrine);
    vec3 col = mix(photo * 0.8, waterCol, 0.5);
    col += shimmer * haloclineRefract * (0.8 + audioKick * 0.9);

    if (hue > 0.001) col = hueRot(col, hue);

    col /= 1.0 + 0.32 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
