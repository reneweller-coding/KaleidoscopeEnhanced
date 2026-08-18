#version 430 core
in vec3 tePos;
in vec3 teNormal;
in vec2 teUV;
in float teAurora;
in float teSky;

out vec4 fragColor;

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
uniform float auroraP;
uniform float hueP;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image; the arc follows the musical key (audioChromaHue
// is circular-slewed = jump-free), valence shapes saturation.
uniform float audioChromaHue;
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
    float glw = (glowP   > 0.0) ? glowP   : 1.0;
    float aur = (auroraP > 0.0) ? auroraP : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    float canalDist = abs(teUV.x - 0.5);
    float isWater = 1.0 - smoothstep(0.12, 0.18, canalDist);

    // Mountain rock & snow shading
    vec3 rockCol = vec3(0.04, 0.05, 0.08);
    vec3 snowCol = vec3(0.7, 0.8, 0.95);
    float snowMask = smoothstep(0.5, 1.8, tePos.y);
    vec3 mountainCol = mix(rockCol, snowCol, snowMask);

    // Aurora curtain: arctic-green identity, tinted by the photo palette
    // (house standard) instead of the old green/violet rainbow mix.
    vec3 auroraGreen = vec3(0.1, 1.0, 0.4);
    vec3 curtain = mix(auroraGreen, imgPalette(0.15 + 0.10 * sin(teUV.x * 4.0)), 0.55);
    vec3 skyAurora = curtain * teAurora * aur * (0.8 + 0.5 * audioSwell);

    // Curtain wall: bright at its lower hem, fading upward, with vertical rays
    float wallY = clamp((teUV.y - 0.78) / 0.22, 0.0, 1.0);
    float hem = exp(-wallY * 2.2);
    float rays = 0.65 + 0.35 * sin(teUV.x * 90.0 + time * 0.7);
    vec3 skyCol = skyAurora * hem * rays * 2.2;

    // Fjord mirror water reflection
    vec3 waterReflect = skyAurora * 0.55 * (0.6 + 0.4 * sin(tePos.z * 3.0 + time * 1.2)) + img(teUV) * 0.25;
    vec3 fjordCol = mix(mountainCol, waterReflect, isWater);

    // Terrain gets a soft aurora glow from above
    vec3 ground = fjordCol + skyAurora * (1.0 - isWater) * 0.20;

    vec3 col = mix(ground, skyCol, teSky);

    if (hue > 0.001) col = hueRot(col, hue);

    col *= glw;
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
