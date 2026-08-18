#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec2 vTexCoord;
in float vHelixPhase;

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

uniform float pitchP;
uniform float twistP;
uniform float widthP;
uniform float hueP;

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
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping along liquid crystal ribbons
    vec3 photo = img(fract(vTexCoord));

    // Cholesteric Bragg circular reflection color palette (iridescent emerald, sapphire, ruby)
    vec3 braggColor = imgPalette((vWorldPos.z * 3.0 + vHelixPhase * 6.28 + audioPhase) * 0.159);

    // Glowing edges
    float edgeGlow = pow(abs(vTexCoord.y - 0.5) * 2.0, 3.0);

    vec3 col = mix(photo, braggColor, 0.5);
    col += edgeGlow * vec3(1.0, 0.95, 0.6) * (1.2 + audioKick * 2.5);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.02, 0.03, 0.06), 1.0 - exp(-dist * 0.15));

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
