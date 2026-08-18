#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec3 vNormal;
in float vDynamoPhase;
in vec2 vQuadUV;

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

uniform float dynamoP;
uniform float coriolisP;
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

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Sprite profile
    vec2 pt = vQuadUV;   // quad-local [-1,1]; see .vert
    float r2 = dot(pt, pt);
    if (r2 > 1.0) discard;
    float glow = exp(-r2 * 3.5);

    // Photo texture mapping from world coords
    vec2 photoUV = fract(vWorldPos.xy * 0.25 + 0.5);
    vec3 photo = img(photoUV);

    // Molten iron dynamo gold & electric magnetic cyan palette
    vec3 ironGold = vec3(1.0, 0.75, 0.2);
    vec3 fieldCyan = vec3(0.1, 0.9, 1.0);
    vec3 coreColor = mix(ironGold, fieldCyan, sin(vDynamoPhase * 12.56 + audioPhase) * 0.5 + 0.5);

    vec3 col = mix(photo, coreColor, 0.6) * glow;
    // Hot core TINTED by the palette (the white additive term drowned the
    // gold/cyan; metric scan: saturation 0.00).
    col += glow * mix(coreColor, vec3(1.0, 0.98, 0.85), 0.35)
               * (0.45 + audioKick * 1.8);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * 1.6, glow);
}
